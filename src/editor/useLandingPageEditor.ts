import { useCallback, useRef, useState } from 'react'
import { LandingPageSchema, Section } from './types'
import { createSectionFactory, generateId } from './sectionFactories'
import {
  safeEnsureSchema,
  findSectionIndex,
  arrayMove,
  setInTheme,
  updateSectionImmutable,
  addSectionImmutable,
  removeSectionImmutable
} from './editorUtils'

 type MoveTarget = 'up' | 'down' | number

 export default function useLandingPageEditor(initial?: LandingPageSchema) {
  const initialSafe = safeEnsureSchema(initial)
  const initialRef = useRef(initialSafe)
  const [schema, setSchemaState] = useState<LandingPageSchema>(initialSafe)

  const setSchema = useCallback((s: LandingPageSchema | ((prev: LandingPageSchema) => LandingPageSchema)) => {
    setSchemaState((prev) => {
      const next = typeof s === 'function' ? (s as any)(prev) : s
      return safeEnsureSchema(next)
    })
  }, [])

  const addSection = useCallback((type: string, partialProps: Partial<Section> | undefined = undefined) => {
    setSchemaState((prev) => {
      const safe = safeEnsureSchema(prev)
      const id = generateId()
      const factory = createSectionFactory(type, { id, ...(partialProps || {}) } as Partial<Section>)
      const next = { ...safe, sections: addSectionImmutable(safe.sections, factory as Section) }
      return next
    })
  }, [])

  const updateSection = useCallback((id: string | undefined, patch: Partial<Section>) => {
    if (!id) return
    setSchemaState((prev) => {
      const safe = safeEnsureSchema(prev)
      const idx = findSectionIndex(safe.sections, id)
      if (idx === -1) return prev
      const next = { ...safe, sections: updateSectionImmutable(safe.sections, id, patch) }
      return next
    })
  }, [])

  const removeSection = useCallback((id: string | undefined) => {
    if (!id) return
    setSchemaState((prev) => {
      const safe = safeEnsureSchema(prev)
      if (findSectionIndex(safe.sections, id) === -1) return prev
      return { ...safe, sections: removeSectionImmutable(safe.sections, id) }
    })
  }, [])

  // moveSection supports two call styles:
  // - moveSection(id, target: MoveTarget)
  // - moveSection(fromIndex: number, toIndex: number)
  const moveSection = useCallback((idOrFrom: string | number | undefined, target: MoveTarget | number) => {
    setSchemaState((prev) => {
      const safe = safeEnsureSchema(prev)
      // index-based call
      if (typeof idOrFrom === 'number' && typeof target === 'number') {
        const from = Math.max(0, Math.min((safe.sections?.length ?? 1) - 1, idOrFrom))
        const to = Math.max(0, Math.min((safe.sections?.length ?? 1) - 1, target))
        if (from === to) return prev
        return { ...safe, sections: arrayMove(safe.sections ?? [], from, to) }
      }

      // id-based call (backwards-compatible)
      const id = typeof idOrFrom === 'string' ? idOrFrom : undefined
      if (!id) return prev
      const idx = findSectionIndex(safe.sections, id)
      if (idx === -1) return prev
      let dest = idx
      if (target === 'up') dest = Math.max(0, idx - 1)
      else if (target === 'down') dest = Math.min((safe.sections?.length ?? 1) - 1, idx + 1)
      else if (typeof target === 'number') dest = Math.max(0, Math.min((safe.sections?.length ?? 1) - 1, target))
      if (dest === idx) return prev
      return { ...safe, sections: arrayMove(safe.sections ?? [], idx, dest) }
    })
  }, [])

  const updateTheme = useCallback((path: string[], value: any) => {
    if (!Array.isArray(path) || path.length === 0) return
    setSchemaState((prev) => {
      const safe = safeEnsureSchema(prev)
      const nextTheme = setInTheme(safe.theme, path, value)
      return { ...safe, theme: nextTheme }
    })
  }, [])

  const reset = useCallback(() => {
    const original = initialRef.current
    setSchemaState(original)
  }, [])

  return {
    schema,
    setSchema,
    addSection,
    updateSection,
    removeSection,
    moveSection,
    updateTheme,
    reset
  }
}
