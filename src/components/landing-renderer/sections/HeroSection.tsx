import React from 'react'
import { Section, Theme } from '../types'

type Props = { section: Section; theme?: Theme; layout?: any }

export default function HeroSection({ section, theme }: Props) {
  const content = section?.content || {}
  const title = content?.title ?? ''
  const subtitle = content?.subtitle ?? ''
  const bg = content?.backgroundImage

  const primary = theme?.colors?.primary ?? 'var(--lp-color-primary, #111827)'
  const fg = theme?.colors?.foreground ?? '#fff'

  const wrapperStyle: React.CSSProperties = {
    backgroundImage: bg ? `url(${bg})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: fg,
    padding: '4rem 1rem'
  }

  return (
    <div style={wrapperStyle}>
      <div className="prose" style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ color: primary }}>{title}</h1>
        {subtitle ? <p style={{ opacity: 0.9 }}>{subtitle}</p> : null}
        <div style={{ marginTop: 20 }}>
          {(content?.actions || []).map((a: any, i: number) => (
            <a
              key={i}
              href={a?.url ?? '#'}
              className="btn"
              style={{ marginRight: 8, backgroundColor: primary, color: fg, padding: '0.5rem 1rem', borderRadius: 6, display: 'inline-block' }}
            >
              {a?.label ?? 'Action'}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
