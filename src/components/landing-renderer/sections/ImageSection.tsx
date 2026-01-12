import React from 'react'
import { Section } from '../types'

type Props = { section: Section }

export default function ImageSection({ section }: Props) {
  const src = section?.content?.src
  const alt = section?.content?.alt ?? ''
  if (!src) return null
  return (
    <div style={{ padding: '1rem 0', textAlign: 'center' }}>
      <img src={src} alt={alt} style={{ maxWidth: '100%', height: 'auto', borderRadius: 8 }} />
    </div>
  )
}
