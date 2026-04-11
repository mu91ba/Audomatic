import { createClient } from '@supabase/supabase-js'

// These will be set in .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Create Supabase client
// Note: During build time, placeholders are used. Real values needed at runtime.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Type definitions for our database schema
export type Audit = {
  id: string
  url: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
  total_pages?: number      // Total pages discovered to crawl
  processed_pages?: number  // Pages processed so far
  user_id?: string          // User who owns this audit (optional for pre-auth data)
}

export type Page = {
  id: string
  audit_id: string
  url: string
  title: string
  screenshot_url: string
  level: number
  parent_url?: string
  discovered_from?: string  // URL of the page that linked to this one
  depth?: number            // Depth in hierarchy (0 = homepage)
  is_template?: boolean     // True when this page represents a group of similar pages
  template_count?: number   // How many real pages this representative stands for
  template_urls?: string[]  // All URLs in the template group
  source?: 'linked' | 'sitemap_only' // How the page was discovered
  created_at: string
}

export type DesignToken = {
  id: string
  audit_id: string
  colors: ColorToken[]
  typography: TypographyToken[]
  created_at: string
}

export type ColorToken = {
  hex: string
  usage: string[]
  frequency: 'high' | 'medium' | 'low'
  count: number
  examplePages: string[]
}

export type TypographyToken = {
  fontFamily: string
  weights: number[]
  sizes: {
    size: string
    occurrences: number
    flag: boolean
  }[]
}

// Sharing types
export type AuditShare = {
  id: string
  audit_id: string
  shared_with_user_id?: string
  shared_with_email: string
  role: 'commenter' | 'editor'
  invited_by: string
  status: 'pending' | 'accepted'
  created_at: string
  accepted_at?: string
}

// Annotation types for canvas annotations (FigJam-style)
export type AnnotationType = 'sticky_note' | 'text' | 'rectangle' | 'circle' | 'line' | 'arrow'

export type Annotation = {
  id: string
  audit_id: string
  type: AnnotationType
  content?: string
  position_x: number
  position_y: number
  width?: number
  height?: number
  end_x?: number
  end_y?: number
  color: string       // Background/fill color
  stroke_color: string // Border/stroke color
  font_size: number
  z_index: number
  created_at: string
  updated_at: string
}

