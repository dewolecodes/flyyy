import React from 'react'
import { Section } from '../types'

type Props = { section: Section }

export default function PricingSection({ section }: Props) {
  const plans = section?.content?.plans ?? []
  if (!Array.isArray(plans) || plans.length === 0) return null
  return (
    <div style={{ padding: '2rem 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {plans.map((p: any, i: number) => (
          <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: 0 }}>{p?.name ?? 'Plan'}</h4>
            <div style={{ fontSize: 20, marginTop: 8 }}>{p?.price ?? ''}</div>
            <div style={{ marginTop: 12 }}>{p?.description ?? ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
