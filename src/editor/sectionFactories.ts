import { Section } from './types'

export function generateId() {
  // Simple RFC4122 v4-like UUID (sufficient for client-only ids)
  return 'id-' + ([1e7] as any).map(() => 1).join('') + Math.random().toString(16).slice(2)
}

const factories: Record<string, Partial<Section>> = {
  hero: {
    type: 'hero',
    content: { title: 'New Hero', subtitle: '', actions: [] }
  },
  features: {
    type: 'features',
    content: { items: [] }
  },
  cta: {
    type: 'cta',
    content: { heading: 'Call to action', subheading: '', button: { label: 'Click', url: '#' } }
  },
  text: {
    type: 'text',
    content: { body: '' }
  },
  image: {
    type: 'image',
    content: { src: '', alt: '' }
  },
  faq: {
    type: 'faq',
    content: { items: [] }
  },
  pricing: {
    type: 'pricing',
    content: { plans: [] }
  }
}

export function createSectionFactory(type: string, overrides: Partial<Section> = {}): Section {
  const base = factories[type] ?? { type }
  return { ...(base as Section), ...overrides }
}

export function getAvailableSectionTypes(): string[] {
  return Object.keys(factories)
}
