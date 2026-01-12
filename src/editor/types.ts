export type ContainerType = 'center' | 'wide' | 'full'

export interface Theme {
  colors?: Record<string, string>
  fonts?: Record<string, string>
  spacing?: Record<string, string>
}

export interface Layout {}

export interface BaseSection {
  id?: string
  type: string
  container?: ContainerType
  spacing?: string
  content?: any
}

export interface HeroSectionData extends BaseSection {
  type: 'hero'
  content?: {
    title?: string
    subtitle?: string
    backgroundImage?: string
    actions?: Array<{ label?: string; url?: string }>
  }
}

export interface FeaturesSectionData extends BaseSection {
  type: 'features'
  content?: {
    items?: Array<{ title?: string; body?: string; icon?: string }>
  }
}

export interface CTASectionData extends BaseSection {
  type: 'cta'
  content?: {
    heading?: string
    subheading?: string
    button?: { label?: string; url?: string }
  }
}

export type Section =
  | HeroSectionData
  | FeaturesSectionData
  | CTASectionData
  | BaseSection

export interface LandingPageSchema {
  schemaVersion?: string
  theme?: Theme
  layout?: Layout
  // The organization that owns this schema (optional when stored as snapshot)
  organizationId?: string
  // When the version was published (if applicable)
  publishedAt?: string | null
  // Sections are expected to be present on a page schema when manipulating/merging
  sections: Section[]
}
