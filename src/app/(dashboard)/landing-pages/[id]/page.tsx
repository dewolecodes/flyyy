import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { TitleBar } from '@/features/dashboard/TitleBar';
import { DashboardSection } from '@/features/dashboard/DashboardSection';
import { db } from '@/libs/DB';
import { landingPageSchema, landingPageVersionSchema } from '@/models/Schema';
import { eq, and, desc } from 'drizzle-orm';

type Props = { params: { id: string } };

export default async function EditLandingPagePage({ params }: Props) {
  const { id } = params;

  const { userId, orgId } = await auth();
  if (!userId) redirect('/sign-in');

  const [page] = await db
    .select()
    .from(landingPageSchema)
    .where(and(eq(landingPageSchema.id, String(id)), eq(landingPageSchema.organizationId, String(orgId))));

  if (!page) {
    // Not found or doesn't belong to this org — redirect back to listing
    redirect('/landing-pages');
  }

  // Compute latest version state so the client can show publish controls.
  const latestVersion = (await db
    .select()
    .from(landingPageVersionSchema)
    .where(eq(landingPageVersionSchema.landingPageId, String(id)))
    .orderBy(desc(landingPageVersionSchema.createdAt))
    .limit(1))[0];

  const hasDraft = !!(latestVersion && latestVersion.publishedAt == null)
  const latestIsPublished = !!(latestVersion && latestVersion.publishedAt != null)

  return (
    <div>
      <TitleBar title="Edit Landing Page" description="Update the landing page content." />

      <DashboardSection title="Edit" description="Edit the selected landing page.">
        {/* Pass initial data to client form */}
        <EditLandingPageForm initial={{
          slug: page.slug,
          title: page.name ?? (page as any).title,
          headline: (page as any).headline ?? '',
          description: (page as any).description ?? '',
        }} id={id} hasDraft={hasDraft} latestIsPublished={latestIsPublished} />
      </DashboardSection>
    </div>
  );
}

'use client';

import * as React from 'react';
import { isAIEnabledClient } from '@/libs/env';
import { useRouter } from 'next/navigation';
import { mapErrorCodeToUIAction, performUIAction } from '@/libs/ApiErrorActions';
import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { normalizeAIToLandingSchema } from '@/lib/ai/landingPageAI';
import { mergeAIDraftIntoSchema } from '@/lib/ai/mergeLandingSchema';

type Initial = {
  slug: string;
  title: string;
  headline: string;
  description: string;
};

function EditLandingPageForm({ initial, id, hasDraft, latestIsPublished }: { initial: Initial; id: string; hasDraft: boolean; latestIsPublished: boolean }) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, getValues } = useForm<Initial & { businessType?: string; targetAudience?: string; tone?: string }>({ defaultValues: { ...initial, businessType: '', targetAudience: '', tone: 'professional' } });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiHelper, setAiHelper] = React.useState<string | null>(null);
  const [aiDraft, setAiDraft] = React.useState<any | null>(null);
  const [aiStatus, setAiStatus] = React.useState<'idle' | 'pending' | 'applied' | 'rejected'>('idle');
  const [aiError, setAiError] = React.useState<string | null>(null);
  const router = useRouter();
  const [uiBanner, setUiBanner] = React.useState<React.ReactNode | null>(null);
  const [currentSchema, setCurrentSchema] = React.useState<any | null>(null);
  const [sectionAIDrafts, setSectionAIDrafts] = React.useState<Record<string, any>>({});
  const [publishing, setPublishing] = React.useState(false);
  const [hasDraftState, setHasDraftState] = React.useState<boolean>(hasDraft);
  const [isPublishedState, setIsPublishedState] = React.useState<boolean>(latestIsPublished);

  async function onSubmit(values: Initial) {
    setServerError(null);
    setAiHelper(null);

    try {
      const res = await fetch(`/api/landing-pages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.refusal) {
          setAiHelper(body.refusal);
          return;
        }
        if (body?.error && typeof body.error === 'string' && body.error.startsWith('Refusal:')) {
          setAiHelper(body.error.replace(/^Refusal:\s*/i, ''));
          return;
        }

        const msg = body?.error || `HTTP ${res.status}`;
        setServerError(msg);
      }
      
      const data = await res.json().catch(() => ({}));
      if (data?.refusal) {
        setAiHelper(String(data.refusal));
        return;
      }

      if (data?.headline) setValue('headline', data.headline);
      if (data?.description) setValue('description', data.description);
      const body = await res.json().catch(() => ({}));
      setServerError(body?.error || `HTTP ${res.status}`);
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to update');
    }
  }

  async function generateAI() {
    if (!isAIEnabledClient) {
      setAiError('AI features are disabled');
      return;
    }
    setServerError(null);
    setAiError(null);
    const values = getValues();
    if (!values.title || values.title.trim().length === 0) {
      setServerError('Please provide a title before generating.');
      return;
    }

    setAiLoading(true);
    try {
      // Call production AI route. Pass landingPageId only (server enforces org ownership).
      const res = await fetch('/api/ai/landing-page-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingPageId: id, mode: 'improve', context: { businessName: values.title, audience: 'users', tone: 'professional' } }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body?.error?.code;
        const action = mapErrorCodeToUIAction(code, body?.error?.message);
        if (action.type !== 'none') {
          performUIAction(action, router, setUiBanner);
          return;
        }

        if (res.status === 403) setAiError('Unauthorized to generate AI suggestions for this organization.');
        else if (res.status === 404) setAiError('Landing page not found for AI generation.');
        else setAiError(body?.error || `AI request failed: ${res.status}`);
        return;
      }

      const body = await res.json();
      if (!body?.aiDraft || !body.aiDraft.suggestion) {
        setAiError('AI returned no suggestion');
        return;
      }

      // Client-side normalize for safe preview (server already normalizes too)
      const normalized = normalizeAIToLandingSchema(body.aiDraft.suggestion);
      const envelope = { ...body.aiDraft, suggestion: normalized, status: 'pending' };
      setAiDraft(envelope);
      setAiStatus('pending');
    } catch (err: any) {
      setAiError(err?.message ?? 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  }

  // Fetch current draft schema for section-level operations
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/landing-pages/draft?landingPageId=${encodeURIComponent(id)}`)
        if (!res.ok) return
        const body = await res.json()
        if (cancelled) return
        if (body?.schema) setCurrentSchema(body.schema)
      } catch (e) {
        // non-blocking
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // Section-level AI: generate suggestion for a single section
  async function generateSectionAI(section: any, mode: 'rewrite' | 'improve' | 'generate') {
    setAiError(null)
    if (!isAIEnabledClient) {
      setAiError('AI features are disabled');
      return;
    }
    try {
      const payload: any = {
        landingPageId: id,
        mode: mode === 'rewrite' ? 'improve' : mode === 'improve' ? 'improve' : 'section-only',
        context: { sectionId: section.id, sectionType: section.type, sectionProps: section }
      }

      const res = await fetch('/api/ai/landing-page-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        const code = b?.error?.code;
        const action = mapErrorCodeToUIAction(code, b?.error?.message);
        if (action.type !== 'none') {
          performUIAction(action, router, setUiBanner);
          return;
        }

        if (res.status === 403) setAiError('Unauthorized to generate AI suggestions for this organization.');
        else if (res.status === 404) setAiError('Landing page not found for AI generation.');
        else setAiError(b?.error || `AI request failed: ${res.status}`);
        return;
      }

      const body = await res.json()
      if (!body?.aiDraft || !body.aiDraft.suggestion) {
        setAiError('AI returned no suggestion')
        return
      }

      const normalized = normalizeAIToLandingSchema(body.aiDraft.suggestion)
      // pick the first suggested section, or use normalized as fallback
      const suggestedSection = Array.isArray(normalized.sections) && normalized.sections.length > 0 ? normalized.sections[0] : (normalized as any)

      const envelope = { ...body.aiDraft, suggestion: suggestedSection, status: 'pending' }
      setSectionAIDrafts((prev) => ({ ...prev, [section.id]: envelope }))
    } catch (err: any) {
      setAiError(err?.message ?? 'AI request failed')
    }
  }

  // Apply a section-level suggestion: merge only that section and persist
  async function applySectionSuggestion(sectionId: string) {
    const draft = sectionAIDrafts[sectionId]
    if (!draft) return
    setAiError(null)
    try {
      const g = await fetch(`/api/landing-pages/draft?landingPageId=${encodeURIComponent(id)}`)
      const gb = await g.json().catch(() => ({}))
      const current = gb?.schema ?? { schemaVersion: '1', sections: [], theme: {} }

      // Ensure suggestion keeps the original section id so merge matches by id
      const suggestionSection = { ...(draft.suggestion || {}), id: sectionId }

      const merged = mergeAIDraftIntoSchema(current, { sections: [suggestionSection] })

      const aiRecord = { ...draft, status: 'applied', appliedAt: new Date().toISOString(), sectionId }
      ;(merged as any).aiDrafts = Array.isArray((merged as any).aiDrafts) ? [...(merged as any).aiDrafts, aiRecord] : [aiRecord]

      const res = await fetch('/api/landing-pages/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ landingPageId: id, schema: merged }) })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setAiError(b?.error || `Save failed: ${res.status}`)
        return
      }

      // update local state
      setSectionAIDrafts((prev) => ({ ...prev, [sectionId]: { ...aiRecord } }))
      setCurrentSchema(merged)
    } catch (err: any) {
      setAiError(err?.message ?? 'Apply failed')
    }
  }

  async function rejectSectionSuggestion(sectionId: string) {
    const draft = sectionAIDrafts[sectionId]
    if (!draft) return
    setAiError(null)
    try {
      const g = await fetch(`/api/landing-pages/draft?landingPageId=${encodeURIComponent(id)}`)
      const gb = await g.json().catch(() => ({}))
      const current = gb?.schema ?? { schemaVersion: '1', sections: [], theme: {} }

      const aiRecord = { ...draft, status: 'rejected', rejectedAt: new Date().toISOString(), sectionId }
      ;(current as any).aiDrafts = Array.isArray((current as any).aiDrafts) ? [...(current as any).aiDrafts, aiRecord] : [aiRecord]

      const res = await fetch('/api/landing-pages/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ landingPageId: id, schema: current }) })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setAiError(b?.error || `Save failed: ${res.status}`)
        return
      }

      setSectionAIDrafts((prev) => ({ ...prev, [sectionId]: { ...aiRecord } }))
      setCurrentSchema(current)
    } catch (err: any) {
      setAiError(err?.message ?? 'Reject failed')
    }
  }

  // (Whole-draft apply/reject handlers removed in favor of section-level actions.)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          {isPublishedState ? <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">Published</span> : <span className="inline-block rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">Unpublished</span>}
        </div>
        <div className="flex items-center gap-2">
          {hasDraftState && (
            <Button onClick={async () => {
              setPublishing(true);
              try {
                const res = await fetch(`/api/landing-pages/${id}/publish`, { method: 'POST' });
                if (!res.ok) {
                  const b = await res.json().catch(() => ({}));
                  const code = b?.error?.code;
                  const action = mapErrorCodeToUIAction(code, b?.error?.message);
                  if (action.type !== 'none') {
                    performUIAction(action, router, setUiBanner);
                  } else {
                    setServerError(b?.error || `Publish failed: ${res.status}`);
                  }
                } else {
                  const data = await res.json().catch(() => ({}));
                  if (data?.published) {
                    // Update UI state without a full reload: draft has been published.
                    setIsPublishedState(true);
                    setHasDraftState(false);
                  }
                }
              } catch (err: any) {
                setServerError(err?.message ?? 'Publish failed');
              } finally {
                setPublishing(false);
              }
            }} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
          )}

          {isPublishedState && (
            <Button variant="secondary" onClick={async () => {
              setPublishing(true);
              try {
                const res = await fetch(`/api/landing-pages/${id}/unpublish`, { method: 'POST' });
                if (!res.ok) {
                  const b = await res.json().catch(() => ({}));
                  const code = b?.error?.code;
                  const action = mapErrorCodeToUIAction(code, b?.error?.message);
                  if (action.type !== 'none') {
                    performUIAction(action, router, setUiBanner);
                  } else {
                    setServerError(b?.error || `Unpublish failed: ${res.status}`);
                  }
                } else {
                  const data = await res.json().catch(() => ({}));
                  if (data?.unpublished) {
                    // Update UI state without a full reload: page is now unpublished.
                    setIsPublishedState(false);
                    setHasDraftState(false);
                  }
                }
              } catch (err: any) {
                setServerError(err?.message ?? 'Unpublish failed');
              } finally {
                setPublishing(false);
              }
            }} disabled={publishing}>
              {publishing ? 'Working…' : 'Unpublish'}
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border p-3">
        <div className="text-sm font-medium mb-2">AI Assist</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label>Business Type</Label>
            <input
              {...register('businessType')}
              className="flex h-9 w-full rounded-md border px-3 py-1 text-sm"
              placeholder="e.g. SaaS analytics platform"
            />
          </div>

          <div className="sm:col-span-1">
            <Label>Target Audience</Label>
            <input
              {...register('targetAudience')}
              className="flex h-9 w-full rounded-md border px-3 py-1 text-sm"
              placeholder="e.g. product managers"
            />
          </div>

          <div className="sm:col-span-1">
            <Label>Tone</Label>
            <select
              {...register('tone')}
              className="flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm"
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="persuasive">Persuasive</option>
            </select>
          </div>
        </div>
        {aiHelper && <div className="mt-2 text-sm text-muted-foreground italic">{aiHelper}</div>}
        <div className="mt-2 text-sm">Status: {aiStatus}{aiLoading ? ' — working…' : ''}</div>
        {aiDraft && (
          <div className="mt-2">
            <div className="text-sm font-medium">AI suggestion (page-level preview)</div>
            <details>
              <summary>Preview suggestion</summary>
              <pre style={{ maxHeight: 300, overflow: 'auto', background: '#f7f7f7', padding: 8 }}>{JSON.stringify(aiDraft.suggestion, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>

      {/* Section-level AI controls */}
      <div className="rounded-md border p-3">
        <div className="text-sm font-medium mb-2">Sections AI</div>
        {!currentSchema && <div className="text-sm text-muted-foreground">Loading sections…</div>}
        {currentSchema && Array.isArray(currentSchema.sections) && currentSchema.sections.length === 0 && <div className="text-sm text-muted-foreground">No sections to suggest for.</div>}
        {currentSchema && Array.isArray(currentSchema.sections) && currentSchema.sections.map((s: any) => (
          <div key={s.id || Math.random()} className="mb-3 border rounded p-2">
            <div className="flex items-center justify-between">
              <div><strong>{s.type}</strong> {s.id ? <span className="text-xs text-muted-foreground">({s.id})</span> : null}</div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => generateSectionAI(s, 'rewrite')} disabled={!isAIEnabledClient}>Rewrite</Button>
                <Button size="sm" onClick={() => generateSectionAI(s, 'improve')} disabled={!isAIEnabledClient}>Improve</Button>
                <Button size="sm" onClick={() => generateSectionAI(s, 'generate')} disabled={!isAIEnabledClient}>Generate</Button>
              </div>
            </div>
            <div className="mt-2 text-sm">
              <details>
                <summary>Current section preview</summary>
                <pre style={{ maxHeight: 200, overflow: 'auto', background: '#fafafa', padding: 8 }}>{JSON.stringify(s, null, 2)}</pre>
              </details>
            </div>
            {sectionAIDrafts[s.id] && (
              <div className="mt-2">
                <div className="text-sm font-medium">AI suggestion (preview)</div>
                <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f7f7f7', padding: 8 }}>{JSON.stringify(sectionAIDrafts[s.id].suggestion, null, 2)}</pre>
                <div className="flex items-center gap-2 mt-2">
                  <Button onClick={() => applySectionSuggestion(s.id)}>Apply</Button>
                  <Button variant="secondary" onClick={() => rejectSectionSuggestion(s.id)}>Reject</Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {aiError && <div className="mt-2 text-sm text-destructive">{aiError}</div>}
      </div>
      <div>
        <Label>Slug</Label>
        <Input {...register('slug', { required: 'Slug is required' })} />
        {errors.slug && <div className="text-sm text-destructive">{errors.slug.message}</div>}
      </div>

      <div>
        <Label>Title</Label>
        <Input {...register('title', { required: 'Title is required' })} />
        {errors.title && <div className="text-sm text-destructive">{errors.title.message}</div>}
      </div>

      <div>
        <Label>Headline</Label>
        <Input {...register('headline', { required: 'Headline is required' })} />
        {errors.headline && <div className="text-sm text-destructive">{errors.headline.message}</div>}
      </div>

      <div>
        <Label>Description</Label>
        <textarea
          {...register('description', { required: 'Description is required' })}
          className="w-full rounded-md border px-3 py-2 text-sm"
          rows={4}
        />
        {errors.description && <div className="text-sm text-destructive">{errors.description.message}</div>}
      </div>

      {uiBanner && <div className="mb-3">{uiBanner}</div>}
      {serverError && <div className="text-sm text-destructive">{serverError}</div>}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={generateAI} disabled={aiLoading || isSubmitting || !isAIEnabledClient} variant="secondary">
          {aiLoading ? 'Generating…' : 'Generate with AI'}
        </Button>

        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
        <Button asChild variant="secondary">
          <a href="/landing-pages">Cancel</a>
        </Button>
      </div>
    </form>
  );
}
