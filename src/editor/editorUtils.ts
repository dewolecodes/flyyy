import { LandingPageSchema, Section } from './types'

export function safeEnsureSchema(schema?: LandingPageSchema): LandingPageSchema {
  return {
    schemaVersion: schema?.schemaVersion ?? '1',
    theme: schema?.theme ?? {},
    layout: schema?.layout ?? {},
    sections: Array.isArray(schema?.sections) ? schema!.sections! : []
  }
}

export function findSectionIndex(sections: Section[] | undefined, id?: string) {
  if (!sections || !id) return -1
  return sections.findIndex((s) => s?.id === id)
}

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const len = arr.length
  const f = Math.max(0, Math.min(len - 1, from))
  const t = Math.max(0, Math.min(len - 1, to))
  if (f === t) return arr.slice()
  const copy = arr.slice()
  const item = copy.splice(f, 1)[0]
  if (typeof item === 'undefined') return copy
  copy.splice(t, 0, item)
  return copy
}

export function setInTheme(theme: any, path: string[], value: any) {
  const copy = { ...(theme ?? {}) }
  if (!Array.isArray(path) || path.length === 0) return copy
  let cur: any = copy
  for (let i = 0; i < path.length - 1; i++) {
    const key = String(path[i])
    const next = cur[key]
    cur[key] = typeof next === 'object' && next !== null ? { ...next } : {}
    cur = cur[key]
  }
  const lastKey = String(path[path.length - 1])
  cur[lastKey] = value
  return copy
}

export function updateSectionImmutable(sections: Section[] = [], id?: string, patch?: Partial<Section>) {
  if (!id) return sections.slice()
  return sections.map((s) => (s?.id === id ? { ...(s || {}), ...(patch || {}) } : s))
}

export function addSectionImmutable(sections: Section[] = [], section: Section) {
  const copy = sections.slice()
  copy.push(section)
  return copy
}

export function removeSectionImmutable(sections: Section[] = [], id?: string) {
  if (!id) return sections.slice()
  return sections.filter((s) => s?.id !== id)
}
