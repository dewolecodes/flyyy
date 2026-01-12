"use client"

import React, { useMemo, useEffect, useState, useRef } from 'react'
import useLandingPageEditor from '../../../editor/useLandingPageEditor'
import { createSectionFactory, generateId } from '../../../editor/sectionFactories'
import LandingPageRenderer from '../../../components/landing-renderer/LandingPageRenderer'
import './styles.css'
import { normalizeAIToLandingSchema } from '@/lib/ai/landingPageAI'
import { mergeAIDraftIntoSchema } from '@/lib/ai/mergeLandingSchema'

// DnD kit imports
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableItem({ id, label }: { id: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }
  return (
    <div ref={setNodeRef as any} className="section-item" style={style} {...attributes}>
      <div {...listeners} className="drag-handle">⋮</div>
      <div className="section-label">{label}</div>
    </div>
  )
}

export default function Page() {
  const initial = useMemo(() => {
    const hero = createSectionFactory('hero', { id: generateId() })
    const features = createSectionFactory('features', {
      id: generateId(),
      content: { items: [{ title: 'Fast', body: 'Blazing fast performance' }, { title: 'Secure', body: 'Enterprise security' }] }
    })

    return {
      schemaVersion: '1',
      theme: { colors: { primary: '#0ea5a4', foreground: '#ffffff' }, fonts: { body: 'Inter' } },
      layout: {},
      sections: [hero, features]
    }
  }, [])

  const { schema, setSchema, addSection, moveSection, removeSection, updateTheme } = useLandingPageEditor(initial)

  // Dev playground persistence keys (stable across reloads)
  const DEV_ORG = 'dev-org'
  const DEV_SLUG = 'dev-playground'
  const DEV_NAME = 'Dev Landing'

  const [landingPageId, setLandingPageId] = useState<string | null>(null)
  const [aiDraft, setAiDraft] = useState<any | null>(null)
  const [aiStatus, setAiStatus] = useState<'idle' | 'pending' | 'applied' | 'rejected'>('idle')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const saveTimeout = useRef<number | null>(null)

  // Hydrate from server on load (fetch latest draft by slug+org)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/landing-pages/draft?slug=${encodeURIComponent(DEV_SLUG)}&orgId=${encodeURIComponent(DEV_ORG)}`)
        if (!res.ok) return
        const body = await res.json()
        if (cancelled) return
        if (body?.schema) {
          setSchema(body.schema)
        }
      } catch (e) {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [setSchema])

  // Autosave: debounced 1.5s, fire-and-forget
  useEffect(() => {
    // don't save if schema is falsy
    if (!schema) return
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current)
    saveTimeout.current = window.setTimeout(() => {
      // fire-and-forget
      ;(async () => {
        try {
          const payload: any = { schema }
          if (landingPageId) payload.landingPageId = landingPageId
          else {
            payload.organizationId = DEV_ORG
            payload.slug = DEV_SLUG
            payload.name = DEV_NAME
          }
          const res = await fetch('/api/landing-pages/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          if (!res.ok) return
          const body = await res.json()
          if (body?.landingPageId) setLandingPageId(body.landingPageId)
        } catch (e) {
          // ignore network/save errors (non-blocking)
        }
      })()
    }, 1500)
    return () => {
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current)
    }
  }, [schema, landingPageId])

  // AI: generate a suggestion and keep in local state only (do not persist)
  const generateWithAI = async (mode: 'from-scratch' | 'improve' | 'section-only' = 'improve') => {
    setAiError(null)
    setAiLoading(true)
    try {
      // Ensure landingPageId exists (create via draft save if needed)
      let lpId = landingPageId
      if (!lpId) {
        const payload: any = { schema }
        payload.organizationId = DEV_ORG
        payload.slug = DEV_SLUG
        payload.name = DEV_NAME
        const res = await fetch('/api/landing-pages/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (res.ok) {
          const body = await res.json()
          if (body?.landingPageId) {
            lpId = body.landingPageId
            setLandingPageId(lpId)
          }
        }
      }

      if (!lpId) {
        setAiError('Failed to establish landing page id')
        setAiLoading(false)
        return
      }

      const res = await fetch('/api/ai/landing-page-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ landingPageId: lpId, mode, context: { businessName: DEV_NAME, audience: 'developers', tone: 'professional' } }) })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setAiError(b?.error || `AI request failed: ${res.status}`)
        setAiLoading(false)
        return
      }

      const body = await res.json()
      if (!body?.aiDraft || !body.aiDraft.suggestion) {
        setAiError('AI returned no suggestion')
        setAiLoading(false)
        return
      }

      // Normalize suggestion server-side returned object may already be normalized,
      // but run it through client-side normalizer to be safe for preview.
      const normalized = normalizeAIToLandingSchema(body.aiDraft.suggestion)
      const envelope = { ...body.aiDraft, suggestion: normalized, status: 'pending' }
      setAiDraft(envelope)
      setAiStatus('pending')
    } catch (err: any) {
      setAiError(err?.message ?? 'AI request failed')
    } finally {
      setAiLoading(false)
    }
  }

  const applyAiDraft = async () => {
    if (!aiDraft) return
    try {
      // Merge safely into current schema
      const merged = mergeAIDraftIntoSchema(schema, aiDraft.suggestion)

      // Append aiDraft metadata into schema.aiDrafts[] with status 'applied'
      const aiRecord = { ...aiDraft, status: 'applied', appliedAt: new Date().toISOString() }
      const nextSchema: any = { ...merged }
      nextSchema.aiDrafts = Array.isArray(nextSchema.aiDrafts) ? [...nextSchema.aiDrafts, aiRecord] : [aiRecord]

      // Update editor state locally
      setSchema(nextSchema)

      // Persist via existing draft save flow (single writer)
      const payload: any = { landingPageId: landingPageId, schema: nextSchema }
      // If no landingPageId (should not happen), include org/slug/name
      if (!landingPageId) {
        payload.organizationId = DEV_ORG
        payload.slug = DEV_SLUG
        payload.name = DEV_NAME
      }
      const res = await fetch('/api/landing-pages/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setAiError(b?.error || `Save failed: ${res.status}`)
        return
      }

      setAiStatus('applied')
      setAiDraft(aiRecord)
    } catch (err: any) {
      setAiError(err?.message ?? 'Apply failed')
    }
  }

  const rejectAiDraft = async () => {
    if (!aiDraft) return
    try {
      const aiRecord = { ...aiDraft, status: 'rejected', rejectedAt: new Date().toISOString() }
      // Persist rejection into schema.aiDrafts[] so there's an audit trail
      const nextSchema: any = { ...(schema || {}) }
      nextSchema.aiDrafts = Array.isArray(nextSchema.aiDrafts) ? [...nextSchema.aiDrafts, aiRecord] : [aiRecord]

      setSchema(nextSchema)

      const payload: any = { landingPageId: landingPageId, schema: nextSchema }
      if (!landingPageId) {
        payload.organizationId = DEV_ORG
        payload.slug = DEV_SLUG
        payload.name = DEV_NAME
      }
      const res = await fetch('/api/landing-pages/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setAiError(b?.error || `Save failed: ${res.status}`)
        return
      }

      setAiStatus('rejected')
      setAiDraft(aiRecord)
    } catch (err: any) {
      setAiError(err?.message ?? 'Reject failed')
    }
  }

  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const fromIndex = schema?.sections?.findIndex((s) => s?.id === active.id) ?? -1
    const toIndex = schema?.sections?.findIndex((s) => s?.id === over.id) ?? -1
    if (fromIndex === -1 || toIndex === -1) return
    if (fromIndex === toIndex) return
    // use index-based move API
    moveSection(fromIndex, toIndex)
  }

  const addHero = () => addSection('hero')
  const addCTA = () => addSection('cta')

  const moveFirstDown = () => {
    const id = schema?.sections?.[0]?.id
    if (id) moveSection(id, 'down')
  }

  const removeLast = () => {
    const last = schema?.sections?.[schema.sections.length - 1]?.id
    if (last) removeSection(last)
  }

  const togglePrimary = () => {
    const current = schema?.theme?.colors?.primary
    const next = current === '#ff0000' ? '#0ea5a4' : '#ff0000'
    updateTheme(['colors', 'primary'], next)
  }

  return (
    <div className="editor-root">
      <div className="editor-main">
        <h2 className="editor-title">Landing Editor Test (Dev)</h2>

        <div className="controls">
          <button className="btn" onClick={addHero}>➕ Add Hero</button>
          <button className="btn" onClick={addCTA}>➕ Add CTA</button>
          <button className="btn" onClick={moveFirstDown}>⬆ Move first section down</button>
          <button className="btn" onClick={removeLast}>❌ Remove last section</button>
          <button className="btn" onClick={togglePrimary}>🎨 Change primary color</button>
        </div>

        <div className="theme-controls">
          <div className="subheading">Theme controls</div>
          <div className="theme-row">
            <label className="theme-label">
              Primary:
              <input
                className="input"
                type="color"
                value={(schema?.theme?.colors?.primary as string) ?? '#0ea5a4'}
                onChange={(e) => updateTheme(['colors', 'primary'], e.target.value)}
              />
            </label>

            <label className="theme-label">
              Background:
              <input
                className="input"
                type="color"
                value={(schema?.theme?.colors?.background as string) ?? '#ffffff'}
                onChange={(e) => updateTheme(['colors', 'background'], e.target.value)}
              />
            </label>

            <label className="theme-label">
              Base font:
              <select className="select" value={(schema?.theme?.fonts?.body as string) ?? 'Inter'} onChange={(e) => updateTheme(['fonts', 'body'], e.target.value)}>
                <option value="Inter">Inter</option>
                <option value="Roboto">Roboto</option>
                <option value="Georgia">Georgia</option>
                <option value="Poppins">Poppins</option>
              </select>
            </label>

            <label className="theme-label">
              Heading font:
              <select className="select" value={(schema?.theme?.fonts?.heading as string) ?? 'Inter'} onChange={(e) => updateTheme(['fonts', 'heading'], e.target.value)}>
                <option value="Inter">Inter</option>
                <option value="Roboto">Roboto</option>
                <option value="Georgia">Georgia</option>
                <option value="Poppins">Poppins</option>
              </select>
            </label>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: '#374151' }}>Sections (drag to reorder)</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="list-title">Sections (drag to reorder)</div>
            <SortableContext items={(schema?.sections || []).map((s) => s?.id || 'unknown')} strategy={verticalListSortingStrategy}>
              <div className="sections-list">
                {(schema?.sections || []).map((s) => (
                  <SortableItem key={s?.id ?? Math.random()} id={String(s?.id ?? '')} label={s?.type ?? 'unknown'} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="renderer-wrap">
            <LandingPageRenderer schema={schema} />
          </div>
        </div>
      </div>

      <div className="debug-wrap">
        <h3>Schema (live)</h3>
        <div className="ai-panel">
          <h4>AI Assist</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="btn" onClick={() => generateWithAI('from-scratch')} disabled={aiLoading}>Generate (from scratch)</button>
            <button className="btn" onClick={() => generateWithAI('improve')} disabled={aiLoading}>Improve</button>
            <button className="btn" onClick={() => generateWithAI('section-only')} disabled={aiLoading}>Section only</button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Status:</strong> {aiStatus}{aiLoading && ' — working...'}
          </div>
          {aiError && <div style={{ color: 'red' }}>{aiError}</div>}
          {aiDraft && (
            <div>
              <div style={{ marginBottom: 8 }}>
                <button className="btn" onClick={applyAiDraft} disabled={aiStatus === 'applied'}>Apply suggestion</button>
                <button className="btn" onClick={rejectAiDraft} disabled={aiStatus === 'rejected'}>Reject suggestion</button>
              </div>
              <details>
                <summary>Preview suggestion</summary>
                <pre style={{ maxHeight: 300, overflow: 'auto', background: '#f7f7f7', padding: 8 }}>{JSON.stringify(aiDraft.suggestion, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
        <pre className="debug-pre">{JSON.stringify(schema, null, 2)}</pre>
      </div>
    </div>
  )
}
