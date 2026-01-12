import { LandingPageSchema, Section } from '@/components/landing-renderer/types'

/**
 * Normalize raw AI output into a safe partial LandingPageSchema.
 * Safety rules enforced here:
 * - Only allow known top-level keys: schemaVersion, theme, layout, sections
 * - For sections, only allow known shape per section type and drop unknown fields
 * - Strip any `id` fields coming from AI so we never overwrite authoritative ids
 * - Never touch publishing metadata or organization ownership (these are not part
 *   of the LandingPageSchema and are enforced at the API/DB layer)
 *
 * This function is conservative: it drops unknown fields and coerces types where
 * reasonable. It returns a partial schema that is safe to preview and to persist
 * inside an `aiDrafts` array (the client-side must call the existing draft save
 * endpoint to actually persist into the DB).
 */
export function normalizeAIToLandingSchema(raw: any): Partial<LandingPageSchema> {
  const out: Partial<LandingPageSchema> = {}

  if (!raw || typeof raw !== 'object') return out

  if (typeof raw.schemaVersion === 'string') out.schemaVersion = raw.schemaVersion

  if (raw.theme && typeof raw.theme === 'object') {
    out.theme = {}
    for (const k of Object.keys(raw.theme)) {
      const v = raw.theme[k]
      if (typeof v === 'string') (out.theme as any)[k] = v
    }
  }

  if (raw.layout && typeof raw.layout === 'object') {
    // layout is free-form for now; copy only plain objects
    out.layout = {}
    for (const k of Object.keys(raw.layout)) {
      const v = raw.layout[k]
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'object') (out.layout as any)[k] = v
    }
  }

  if (Array.isArray(raw.sections)) {
    // Only allow known/whitelisted section types to avoid unexpected components
    const allowed = new Set(['hero', 'features', 'cta'])
    out.sections = raw.sections
      .filter((s: any) => s && typeof s === 'object' && typeof s.type === 'string' && allowed.has(String(s.type)))
      .map((s: any) => normalizeSection(s))
  }

  return out
}

function normalizeSection(s: any): Section {
  const base: any = {
    type: String(s.type),
  }

  // Avoid trusting any `id` coming from AI
  if (s.container && (s.container === 'center' || s.container === 'wide' || s.container === 'full')) base.container = s.container
  if (s.spacing && typeof s.spacing === 'string') base.spacing = s.spacing

  const content: any = {}

  // Per-type sanitization: only allow expected keys under content
  switch (base.type) {
    case 'hero':
      if (s.content && typeof s.content === 'object') {
        if (typeof s.content.title === 'string') content.title = s.content.title
        if (typeof s.content.subtitle === 'string') content.subtitle = s.content.subtitle
        if (typeof s.content.backgroundImage === 'string') content.backgroundImage = s.content.backgroundImage
        if (Array.isArray(s.content.actions)) {
          content.actions = s.content.actions
            .filter((a: any) => a && typeof a === 'object')
            .map((a: any) => ({ label: String(a.label ?? ''), url: String(a.url ?? '') }))
        }
      }
      break

    case 'features':
      if (s.content && typeof s.content === 'object') {
        if (Array.isArray(s.content.items)) {
          content.items = s.content.items
            .filter((it: any) => it && typeof it === 'object')
            .map((it: any) => ({ title: String(it.title ?? ''), body: String(it.body ?? ''), icon: String(it.icon ?? '') }))
        }
      }
      break

    case 'cta':
      if (s.content && typeof s.content === 'object') {
        if (typeof s.content.heading === 'string') content.heading = s.content.heading
        if (typeof s.content.subheading === 'string') content.subheading = s.content.subheading
        if (s.content.button && typeof s.content.button === 'object') content.button = { label: String(s.content.button.label ?? ''), url: String(s.content.button.url ?? '') }
      }
      break

    default:
      // Generic section: only keep container, spacing and a shallow copy of content with primitive values
      if (s.content && typeof s.content === 'object') {
        for (const k of Object.keys(s.content)) {
          const v = s.content[k]
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') content[k] = v
        }
      }
  }

  base.content = content

  return base as Section
}

/**
 * Stubbed AI generator. Replace with real OpenAI client in production.
 * Returns a raw suggestion object that will be normalized by `normalizeAIToLandingSchema`.
 */
export async function generateAISuggestion(_landingPageId: string, mode: 'from-scratch' | 'improve' | 'section-only', context?: any): Promise<any> {
  // NOTE: This function is intentionally a deterministic stub to keep tests
  // hermetic. Replace the body below with a real LLM call; ensure the LLM's
  // output is passed through `normalizeAIToLandingSchema` before returning to
  // callers.

  const sample: any = {
    schemaVersion: '1',
    sections: [],
  }

  if (mode === 'from-scratch') {
    sample.sections.push({ type: 'hero', content: { title: `${context?.businessName ?? 'Product'} — Build faster`, subtitle: `${context?.audience ?? 'teams'} love it`, actions: [{ label: 'Get started', url: '/' }] } })
    sample.sections.push({ type: 'features', content: { items: [{ title: 'Fast', body: 'Optimized for speed' }, { title: 'Reliable', body: '99.9% uptime' }] } })
    sample.sections.push({ type: 'cta', content: { heading: 'Ready to try?', subheading: 'Start your free trial', button: { label: 'Sign up', url: '/signup' } } })
  } else if (mode === 'improve') {
    sample.sections.push({ type: 'hero', content: { title: `Improved headline for ${context?.businessName ?? 'your product'}`, subtitle: 'Clarified value proposition' } })
  } else if (mode === 'section-only') {
    sample.sections.push({ type: 'features', content: { items: [{ title: 'New feature', body: 'AI suggested feature description' }] } })
  }

  return sample
}
