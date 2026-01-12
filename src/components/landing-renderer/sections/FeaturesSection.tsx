import React from 'react'
import { Section, Theme } from '../types'

type Props = { section: Section; theme?: Theme; layout?: any }

export default function FeaturesSection({ section, theme }: Props) {
  const items = section?.content?.items ?? []
  const primary = theme?.colors?.primary ?? 'var(--lp-color-primary, #111827)'

  if (!Array.isArray(items) || items.length === 0) {
    return null
  }

  return (
    <div style={{ padding: '2rem 0' }}>
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {items.map((it: any, idx: number) => (
          <div key={idx} style={{ borderRadius: 8, padding: 16, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: primary, marginBottom: 8 }}>{it?.title ?? 'Feature'}</h3>
            <p style={{ margin: 0, color: '#374151' }}>{it?.body ?? ''}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
