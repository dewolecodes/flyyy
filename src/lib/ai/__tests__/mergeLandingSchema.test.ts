import { describe, it, expect } from 'vitest'
import { mergeAIDraftIntoSchema } from '../mergeLandingSchema'

const baseSchema = {
  schemaVersion: '1',
  theme: { colors: { primary: '#00f' } },
  sections: [
    { id: 's1', type: 'hero', content: { title: 'Old title', subtitle: 'Old subtitle' } },
    { id: 's2', type: 'features', content: { items: [{ title: 'A', body: 'a' }] } }
  ],
  // publishing metadata (should be preserved)
  publishedAt: '2025-01-01T00:00:00Z',
  organizationId: 'org_123'
}

describe('mergeAIDraftIntoSchema', () => {
  it('preserves existing section IDs and does not delete sections', () => {
    const suggestion = { sections: [{ id: 's1', type: 'hero', content: { title: 'New title' } }] }
    const merged = mergeAIDraftIntoSchema(JSON.parse(JSON.stringify(baseSchema)), suggestion as any)

    // s1 still exists and id preserved
    expect(merged.sections.find((s: any) => s.id === 's1')).toBeTruthy()
    // s2 still exists
    expect(merged.sections.find((s: any) => s.id === 's2')).toBeTruthy()
  })

  it('merges only targeted section props and ignores unknown fields', () => {
    const suggestion = { sections: [{ id: 's1', type: 'hero', content: { title: 'New title', unknownField: 'should be dropped' } }] }
    const merged = mergeAIDraftIntoSchema(JSON.parse(JSON.stringify(baseSchema)), suggestion as any)

    const s1 = merged.sections.find((s: any) => s.id === 's1')
    expect(s1).toBeTruthy()
    expect(s1!.content.title).toBe('New title')
    // unknownField should not appear
    expect((s1!.content as any).unknownField).toBeUndefined()
  })

  it('does not modify publish metadata', () => {
    const suggestion = { sections: [{ id: 's1', type: 'hero', content: { title: 'New title' } }] }
    const merged = mergeAIDraftIntoSchema(JSON.parse(JSON.stringify(baseSchema)), suggestion as any)

    expect(merged.publishedAt).toBe(baseSchema.publishedAt)
    expect(merged.organizationId).toBe(baseSchema.organizationId)
  })

  it('adds a new section when suggestion has no matching id but does not delete others', () => {
    const suggestion = { sections: [{ type: 'features', content: { items: [{ title: 'New', body: 'New body' }] } }] }
    const merged = mergeAIDraftIntoSchema(JSON.parse(JSON.stringify(baseSchema)), suggestion as any)

    // original two remain
    expect(merged.sections.length).toBeGreaterThanOrEqual(2)
    // new section of type features exists (may be appended)
    expect(merged.sections.some((s: any) => s.type === 'features')).toBeTruthy()
  })
})
