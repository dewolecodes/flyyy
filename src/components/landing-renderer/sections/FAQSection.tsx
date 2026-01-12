import React from 'react'
import { Section } from '../types'

type Props = { section: Section }

export default function FAQSection({ section }: Props) {
  const items = section?.content?.items ?? []
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div style={{ padding: '1rem 0' }}>
      {(items || []).map((q: any, i: number) => (
        <details key={i} style={{ marginBottom: 8 }}>
          <summary style={{ fontWeight: 600 }}>{q?.question ?? 'Question'}</summary>
          <div style={{ marginTop: 8 }}>{q?.answer ?? ''}</div>
        </details>
      ))}
    </div>
  )
}
