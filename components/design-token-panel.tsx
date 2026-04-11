'use client'

import { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { supabase, type DesignToken, type ColorToken, type TypographyToken } from '@/lib/supabase'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { getPathname } from '@/lib/utils'

interface DesignTokenPanelProps {
  auditId: string
  onClose: () => void
}

export function DesignTokenPanel({ auditId, onClose }: DesignTokenPanelProps) {
  const [tokens, setTokens] = useState<DesignToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'colors' | 'typography'>('colors')

  useEffect(() => {
    loadDesignTokens()
  }, [auditId])

  async function loadDesignTokens() {
    try {
      const { data, error } = await supabase
        .from('design_tokens')
        .select('*')
        .eq('audit_id', auditId)
        .single()

      if (error) throw error
      setTokens(data)
    } catch (err) {
      console.error('Error loading design tokens:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-white border-l shadow-xl z-10 flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <h2 className="font-semibold text-lg">Design Tokens</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b flex">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'colors'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('colors')}
        >
          Colors
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'typography'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('typography')}
        >
          Typography
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : !tokens ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Design tokens will appear here once the crawl completes.</p>
          </div>
        ) : (
          <>
            {activeTab === 'colors' && (
              <ColorsTab colors={tokens.colors} />
            )}
            {activeTab === 'typography' && (
              <TypographyTab typography={tokens.typography} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ColorsTab({ colors }: { colors: ColorToken[] }) {
  if (!colors || colors.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No colors found
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Found {colors.length} unique colors
      </div>

      {colors.map((color, index) => (
        <Card key={index} className="p-3">
          <div className="flex items-start gap-3">
            {/* Color swatch */}
            <div
              className="w-12 h-12 rounded border-2 border-gray-200 flex-shrink-0"
              style={{ backgroundColor: color.hex }}
            />

            {/* Color info */}
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm font-medium">
                {color.hex.toUpperCase()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {color.usage.join(', ')}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  color.frequency === 'high' ? 'bg-green-100 text-green-700' :
                  color.frequency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {color.frequency} frequency
                </span>
                <span className="text-xs text-muted-foreground">
                  {color.count} uses
                </span>
              </div>
              {/* Example page link */}
              {color.examplePages && color.examplePages.length > 0 && (
                <a
                  href={color.examplePages[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-2 block"
                >
                  View on: {getPathname(color.examplePages[0])}
                </a>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function TypographyTab({ typography }: { typography: TypographyToken[] }) {
  if (!typography || typography.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No typography found
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Found {typography.length} font families
      </div>

      {typography.map((font, index) => (
        <Card key={index} className="p-4">
          <div className="space-y-3">
            {/* Font family */}
            <div>
              <div className="font-semibold text-lg" style={{ fontFamily: font.fontFamily }}>
                {font.fontFamily}
              </div>
            </div>

            {/* Font weights */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Weights</div>
              <div className="flex flex-wrap gap-1">
                {font.weights.map((weight) => (
                  <span
                    key={weight}
                    className="text-xs px-2 py-1 bg-gray-100 rounded"
                  >
                    {weight}
                  </span>
                ))}
              </div>
            </div>

            {/* Font sizes */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Sizes</div>
              <div className="space-y-1">
                {font.sizes
                  .sort((a, b) => b.occurrences - a.occurrences)
                  .slice(0, 10) // Show top 10 sizes
                  .map((size, sizeIndex) => (
                    <div
                      key={sizeIndex}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{size.size}</span>
                        {size.flag && (
                          <span title="Low usage - Used 3 times or less">
                            <AlertTriangle className="h-3 w-3 text-yellow-600" />
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {size.occurrences}×
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

