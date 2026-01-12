import { describe, it, expect } from 'vitest'
import { normalizeAIToLandingSchema } from '../landingPageAI'

describe('normalizeAIToLandingSchema', () => {
  it('drops unknown section types', () => {
    const raw = {
      schemaVersion: '1',
      sections: [
        { type: 'hero', content: { title: 'Hi' } },
        { type: 'weird', content: { foo: 'bar' } }
      ]
    }

    const normalized = normalizeAIToLandingSchema(raw as any)
    expect(normalized.sections?.length).toBe(1)
    expect(normalized.sections?.[0]?.type).toBe('hero')
  })

  it('drops unknown props and strips section ids', () => {
    const raw = {
      sections: [
        { id: 'malicious', type: 'hero', content: { title: 'Hello', __proto__: 'x' }, extra: 'x' }
      ]
    }

    const normalized = normalizeAIToLandingSchema(raw as any)
    expect(normalized.sections?.[0]?.id).toBeUndefined()
    // content retains title
    expect(normalized.sections?.[0]?.content?.title).toBe('Hello')
    // extra should be dropped
    expect((normalized as any).extra).toBeUndefined()
  })

  it('produces a valid LandingPageSchema shape', () => {
    const raw = {
      schemaVersion: '1',
      theme: { colors: { primary: '#000' } },
      sections: [ { type: 'hero', content: { title: 'X' } } ]
    }

    const out = normalizeAIToLandingSchema(raw as any)
    expect(out.schemaVersion).toBe('1')
    expect(out.theme?.colors?.primary).toBe('#000')
    expect(Array.isArray(out.sections)).toBeTruthy()
  })
})
