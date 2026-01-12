import React from 'react'
import { Section, Theme } from '../types'

type Props = { section: Section; theme?: Theme; layout?: any }

export default function CTASection({ section, theme }: Props) {
  const content = section?.content ?? {}
  const heading = content?.heading ?? ''
  const sub = content?.subheading ?? ''
  const btn = content?.button ?? null
  const primary = theme?.colors?.primary ?? 'var(--lp-color-primary, #111827)'

  return (
    <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
      {heading ? <h2 style={{ color: primary }}>{heading}</h2> : null}
      {sub ? <p style={{ marginTop: 8 }}>{sub}</p> : null}
      {btn ? (
        <a href={btn?.url ?? '#'} style={{ marginTop: 16, display: 'inline-block', background: primary, color: '#fff', padding: '0.6rem 1.2rem', borderRadius: 6 }}>
          {btn?.label ?? 'Learn more'}
        </a>
      ) : null}
    </div>
  )
}
