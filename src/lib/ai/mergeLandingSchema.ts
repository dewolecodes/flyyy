import { LandingPageSchema, Section } from '@/components/landing-renderer/types'
import { createSectionFactory, generateId } from '@/editor/sectionFactories'

/**
 * Safely merge an AI suggestion (partial LandingPageSchema) into an existing schema.
 * Rules enforced:
 * - Only theme keys and section properties are modified.
 * - Section ids from AI are not trusted; existing ids are preserved.
 * - AI may add sections but will not delete existing sections.
 * - For matching, prefer id match, then first unmatched section of same type.
 * - Arrays in content (e.g., actions, items) are replaced with sanitized versions.
 * - No publishing metadata or organization ownership is touched.
 *
 * This function returns a new schema object (immutable).
 */
export function mergeAIDraftIntoSchema(schema: LandingPageSchema, suggestion: Partial<LandingPageSchema>): LandingPageSchema {
  const base: LandingPageSchema = JSON.parse(JSON.stringify(schema || {}))

  // Merge theme tokens: only string values
  if (suggestion.theme && typeof suggestion.theme === 'object') {
    base.theme = base.theme || {}
    for (const topKey of Object.keys(suggestion.theme)) {
      const val = (suggestion.theme as any)[topKey]
      if (val && typeof val === 'object') {
        ;(base.theme as any)[topKey] = { ...((base.theme as any)[topKey] || {}) }
        for (const k of Object.keys(val)) {
          const v = val[k]
          if (typeof v === 'string') {
            ;(base.theme as any)[topKey][k] = v
          }
        }
      } else if (typeof val === 'string') {
        ;(base.theme as any)[topKey] = val
      }
    }
  }

  // Merge sections
  const existing = Array.isArray(base.sections) ? [...base.sections!] : []
  const suggested = Array.isArray(suggestion.sections) ? suggestion.sections : []

  const usedIndexes = new Set<number>()
  const idToIndex = new Map<string, number>()
  existing.forEach((s, idx) => { if (s?.id) idToIndex.set(String(s.id), idx) })

  for (const s of suggested) {
    if (!s || typeof s !== 'object' || !s.type) continue

    // Try id match first
    let targetIdx: number | null = null
    if ((s as any).id && idToIndex.has(String((s as any).id))) {
      targetIdx = idToIndex.get(String((s as any).id)) ?? null
    }

    // Otherwise find first unmatched section of same type
    if (targetIdx === null) {
      for (let i = 0; i < existing.length; i++) {
        if (usedIndexes.has(i)) continue
        if ((existing[i]?.type ?? '') === (s.type ?? '')) {
          targetIdx = i
          break
        }
      }
    }

    if (targetIdx === null) {
      // Append as new section (generate id)
      const newId = generateId()
      const factory = createSectionFactory(s.type, { id: newId, container: (s as any).container, spacing: (s as any).spacing, content: (s as any).content } as Partial<Section>)
      existing.push(factory as Section)
      // merge content into new section (factory already includes content)
      continue
    }

    // Merge into existing[targetIdx]
    usedIndexes.add(targetIdx)
    const target = existing[targetIdx] = { ...(existing[targetIdx] || {}) } as any
    // preserve id
    if (!target.id && (existing[targetIdx] as any).id) target.id = (existing[targetIdx] as any).id

    // merge container/spacing if provided
    if ((s as any).container) target.container = (s as any).container
    if ((s as any).spacing) target.spacing = (s as any).spacing

    // merge content safely
    target.content = target.content || {}
    const sContent = (s as any).content || {}
    for (const key of Object.keys(sContent)) {
      const val = sContent[key]
      if (val == null) continue
      if (Array.isArray(val)) {
        // Replace arrays but sanitize primitives/objects to allowed shapes
        // Only replace arrays if the target already had this key (avoid adding new unknown arrays)
        if (!(key in target.content)) continue
        target.content[key] = val.map((it: any) => {
          if (it == null) return it
          if (typeof it === 'object') {
            const out: any = {}
            for (const k of Object.keys(it)) {
              const v = it[k]
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
            }
            return out
          }
          if (typeof it === 'string' || typeof it === 'number' || typeof it === 'boolean') return it
          return null
        }).filter(Boolean)
      } else if (typeof val === 'object') {
        // Only merge object subkeys if the target already has this key as an object
        if (!(key in target.content) || typeof target.content[key] !== 'object') continue
        target.content[key] = target.content[key] || {}
        for (const k of Object.keys(val)) {
          const v = val[k]
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') (target.content as any)[key][k] = v
        }
      } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        // Only overwrite primitive content keys that already exist on the target
        if (!(key in target.content)) continue
        ;(target.content as any)[key] = val
      }
    }
  }

  base.sections = existing

  return base
}
