import React from 'react'
import { Section, Theme } from '../types'

type Props = { section: Section; theme?: Theme; layout?: any }

export default function TextSection({ section }: Props) {
  const content = section?.content ?? {}
  const body = content?.body ?? ''
  if (!body) return null
  return (
    <div style={{ padding: '1rem 0' }}>
      <div className="prose" dangerouslySetInnerHTML={{ __html: String(body) }} />
    </div>
  )
}
