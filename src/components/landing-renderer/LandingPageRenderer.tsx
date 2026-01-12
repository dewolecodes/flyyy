import React from 'react'
import { LandingPageSchema, Theme } from './types'
import SectionRenderer from './SectionRenderer'

type Props = {
  schema: LandingPageSchema
}

const toCssVars = (theme?: Theme): Record<string, string> => {
  const vars: Record<string, string> = {}
  if (!theme) return vars
  Object.entries(theme.colors || {}).forEach(([k, v]) => (vars[`--lp-color-${k}`] = v || ''))
  Object.entries(theme.fonts || {}).forEach(([k, v]) => (vars[`--lp-font-${k}`] = v || ''))
  Object.entries(theme.spacing || {}).forEach(([k, v]) => (vars[`--lp-space-${k}`] = v || ''))
  return vars
}

export default function LandingPageRenderer({ schema }: Props) {
  const theme = schema?.theme
  const layout = schema?.layout
  const cssVars = toCssVars(theme)

  const style = Object.entries(cssVars).reduce<Record<string, string>>((acc, [k, v]) => {
    acc[k] = String(v ?? '')
    return acc
  }, {})

  const sections = schema?.sections ?? []

  return (
    <div className="landing-page-root" style={style as React.CSSProperties}>
      {sections.map((s, i) => (
        <SectionRenderer key={(s && (s.id ?? `${i}`)) as string | number} section={s} theme={theme} layout={layout} />
      ))}
    </div>
  )
}

// Example usage (small, safe sample)
export function SampleLanding() {
  const sample: LandingPageSchema = {
    schemaVersion: '1',
    theme: { colors: { primary: '#0ea5a4', background: '#ffffff' } },
    sections: [
      { type: 'hero', id: 'hero-1', content: { title: 'Welcome', subtitle: 'Start here', actions: [{ label: 'Get started', url: '#' }] } },
      { type: 'features', id: 'features-1', content: { items: [{ title: 'Fast', body: 'Blazing fast' }, { title: 'Secure', body: 'Bank-grade' }] } },
      { type: 'cta', id: 'cta-1', content: { heading: 'Try it now', button: { label: 'Sign up', url: '#' } } }
    ]
  }

  return <LandingPageRenderer schema={sample} />
}
