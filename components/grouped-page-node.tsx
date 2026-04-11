'use client'

import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { ExternalLink, ChevronDown, ChevronUp, Layers } from 'lucide-react'
import { getPathname } from '@/lib/utils'

interface GroupedPageData {
  pattern: string           // URL pattern like "/blog/*"
  pages: {
    url: string
    title: string
    screenshot_url: string
  }[]
  level: number
  representativeScreenshot: string  // Screenshot of first page in group
  count?: number            // Total page count override (used when crawler pre-grouped)
}

export const GroupedPageNode = memo(({ data }: NodeProps<GroupedPageData>) => {
  const [expanded, setExpanded] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Use the explicit count if provided (crawler-side grouping), otherwise fall back to pages array length
  const pageCount = data.count ?? data.pages.length
  // When count > pages.length, the crawler deduplicated these — we only have the representative
  const isCrawlerGrouped = data.count !== undefined && data.count > data.pages.length

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg border-2 border-indigo-300 overflow-hidden hover:shadow-xl transition-shadow w-[280px]">
        {/* Header with pattern name and count */}
        <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              <span className="font-semibold text-sm text-indigo-900">
                {data.pattern}
              </span>
            </div>
            <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">
              {pageCount} pages
            </span>
          </div>
        </div>

        {/* Representative screenshot (smaller for grouped view) */}
        <div className="relative w-full h-[180px] bg-gray-100">
          {!imageError ? (
            <img
              src={data.representativeScreenshot}
              alt={`${data.pattern} template`}
              className="w-full h-full object-cover object-top opacity-80"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Layers className="h-8 w-8 mx-auto mb-2" />
                <div className="text-xs">{pageCount} pages</div>
              </div>
            </div>
          )}
          {/* Stacked effect overlay */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-2 left-2 right-2 h-full bg-white/30 rounded -z-10 transform translate-y-1" />
            <div className="absolute top-4 left-4 right-4 h-full bg-white/20 rounded -z-20 transform translate-y-2" />
          </div>
        </div>

        {/* Expand/collapse toggle for all grouped nodes */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-2 bg-slate-50 border-t border-gray-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
        >
          <span className="text-xs text-muted-foreground">
            {expanded ? 'Hide pages' : `Show all ${pageCount} pages`}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Expanded page list */}
        {expanded && (
          <div className="max-h-[250px] overflow-y-auto border-t border-gray-200">
            {data.pages.map((page, index) => (
              <a
                key={index}
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex-1 min-w-0">
                  {page.title && (
                    <div className="text-xs font-medium line-clamp-1">
                      {page.title}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground font-mono line-clamp-1">
                    {getPathname(page.url)}
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Connection Handles */}
        {data.level > 0 && (
          <Handle
            type="target"
            position={Position.Top}
            className="!bg-indigo-400 !w-2 !h-2 !border-2 !border-white"
          />
        )}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-indigo-400 !w-2 !h-2 !border-2 !border-white"
        />
      </div>
    </>
  )
})

GroupedPageNode.displayName = 'GroupedPageNode'

