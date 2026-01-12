import React from 'react'
import { NODE_ENV } from '@/libs/env'
import { Section, Theme } from './types'
import HeroSection from './sections/HeroSection'
import FeaturesSection from './sections/FeaturesSection'
import CTASection from './sections/CTASection'
import TextSection from './sections/TextSection'
import ImageSection from './sections/ImageSection'
import FAQSection from './sections/FAQSection'
import PricingSection from './sections/PricingSection'

type Props = { section: Section; theme?: Theme; layout?: any }

const containerClass = (container?: string) => {
  switch (container) {
    case 'center':
      return 'max-w-4xl mx-auto px-4'
    case 'wide':
      return 'max-w-6xl mx-auto px-4'
    case 'full':
      return 'w-full'
    default:
      return 'max-w-4xl mx-auto px-4'
  }
}

export default function SectionRenderer({ section, theme, layout }: Props) {
  if (!section || !section.type) return null

  const common = { section, theme, layout }
  const wrapperClass = containerClass(section.container)
  const spacingStyle = section.spacing ? { padding: section.spacing } : undefined

  switch (section.type) {
    case 'hero':
      return (
        <section className={wrapperClass} style={spacingStyle}>
          <HeroSection {...common} />
        </section>
      )
    case 'features':
      return (
        <section className={wrapperClass} style={spacingStyle}>
          <FeaturesSection {...common} />
        </section>
      )
    case 'cta':
      return (
        <section className={wrapperClass} style={spacingStyle}>
          <CTASection {...common} />
        </section>
      )
    case 'text':
      return (
        <section className={wrapperClass} style={spacingStyle}>
          <TextSection {...common} />
        </section>
      )
    case 'image':
      return (
        <section className={wrapperClass} style={spacingStyle}>
          <ImageSection {...common} />
        </section>
      )
    case 'faq':
      return (
        <section className={wrapperClass} style={spacingStyle}>
          <FAQSection {...common} />
        </section>
      )
    case 'pricing':
      return (
        <section className={wrapperClass} style={spacingStyle}>
          <PricingSection {...common} />
        </section>
      )
    default:
      if (NODE_ENV !== 'production') {
        return (
          <section className={wrapperClass} style={spacingStyle}>
            <div style={{ opacity: 0.6 }}>Unknown section type: {String(section.type)}</div>
          </section>
        )
      }
      return null
  }
}
