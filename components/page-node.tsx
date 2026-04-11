'use client'

import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { ExternalLink, Maximize2 } from 'lucide-react'
import { getPathname } from '@/lib/utils'

interface PageNodeData {
  url: string
  title: string
  screenshot_url: string
  level: number
}

export const PageNode = memo(({ data }: NodeProps<PageNodeData>) => {
  const [showModal, setShowModal] = useState(false)
  const [imageError, setImageError] = useState(false)

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 overflow-hidden hover:shadow-xl transition-shadow w-[280px]">
        {/* Title Header - Now at the top */}
        <div className="px-3 py-2 bg-slate-50 border-b border-gray-200">
          <div className="font-semibold text-sm line-clamp-1" title={data.title}>
            {data.title || 'Untitled Page'}
          </div>
        </div>

        {/* Screenshot - Full height, no scroll */}
        <div
          className="relative w-full bg-gray-100 cursor-pointer group"
          onClick={() => setShowModal(true)}
        >
          {!imageError ? (
            <>
              <img
                src={data.screenshot_url}
                alt={data.title || data.url}
                className="w-full block"
                onError={() => setImageError(true)}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                <Maximize2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <div className="text-xs">Loading...</div>
              </div>
            </div>
          )}
        </div>

        {/* URL Footer - Now at the bottom */}
        <div className="px-3 py-2 bg-slate-50 border-t border-gray-200">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="line-clamp-1 flex-1 font-mono" title={data.url}>
              {getPathname(data.url)}
            </span>
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Connection Handles */}
        {data.level > 0 && (
          <Handle
            type="target"
            position={Position.Top}
            className="!bg-gray-400 !w-2 !h-2 !border-2 !border-white"
          />
        )}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-gray-400 !w-2 !h-2 !border-2 !border-white"
        />
      </div>

      {/* Full Screenshot Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setShowModal(false)}
        >
          <div className="relative max-w-5xl max-h-full overflow-auto bg-white rounded-lg">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{data.title}</h3>
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {data.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>
            <img
              src={data.screenshot_url}
              alt={data.title}
              className="w-full"
            />
          </div>
        </div>
      )}
    </>
  )
})

PageNode.displayName = 'PageNode'

