'use client'

import { NodeProps } from 'reactflow'

interface StandaloneFrameData {
  width: number
  height: number
}

export function StandaloneFrameNode({ data }: NodeProps<StandaloneFrameData>) {
  return (
    <div
      className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 pointer-events-none"
      style={{ width: data.width, height: data.height }}
    >
      <div className="px-4 py-3">
        <span className="text-slate-600 text-sm font-semibold">Standalone Pages</span>
        <span className="ml-2 text-slate-400 text-xs">not linked from any crawled page</span>
      </div>
    </div>
  )
}
