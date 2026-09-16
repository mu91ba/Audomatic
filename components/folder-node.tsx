'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Folder, CalendarDays } from 'lucide-react'

/**
 * A path segment that exists in the site's URLs but was never crawled as a page
 * — /2026 for a date permalink, /news/page for a paginated archive.
 *
 * Drawn deliberately unlike a page card: no screenshot, dashed border, muted.
 * It is structure inferred from URLs, not a page that was visited, and it
 * should not be mistaken for one.
 */
export interface FolderNodeData {
  label: string
  childCount: number
  isDateFolder: boolean
}

export const FolderNode = memo(({ data }: NodeProps<FolderNodeData>) => {
  const Icon = data.isDateFolder ? CalendarDays : Folder

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />

      <div className="w-[280px] rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate font-mono text-sm font-medium text-slate-700">
            {data.label}
          </span>
        </div>
        <div className="mt-1 pl-6 text-xs text-slate-400">
          {data.childCount} {data.childCount === 1 ? 'page' : 'pages'} · not crawled
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </>
  )
})

FolderNode.displayName = 'FolderNode'
