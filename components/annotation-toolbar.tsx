'use client'

import { useState, useRef } from 'react'
import { MousePointer2, Hand, StickyNote, Type, Square, Circle, Minus, ArrowRight, ChevronUp } from 'lucide-react'

export type AnnotationTool =
  | 'select'
  | 'hand'
  | 'sticky_note'
  | 'text'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'

export const SHAPE_TOOL_IDS = new Set<AnnotationTool>(['rectangle', 'circle', 'line', 'arrow'])

export const SHAPE_TOOLS = [
  { id: 'rectangle' as AnnotationTool, icon: Square, label: 'Rectangle', shortcut: 'R' },
  { id: 'circle' as AnnotationTool, icon: Circle, label: 'Circle', shortcut: 'C' },
  { id: 'line' as AnnotationTool, icon: Minus, label: 'Line', shortcut: 'L' },
  { id: 'arrow' as AnnotationTool, icon: ArrowRight, label: 'Arrow', shortcut: 'A' },
]

interface AnnotationToolbarProps {
  activeTool: AnnotationTool
  onToolChange: (tool: AnnotationTool) => void
  onDragStart: (tool: AnnotationTool, e: React.DragEvent) => void
}

export function AnnotationToolbar({ activeTool, onToolChange, onDragStart }: AnnotationToolbarProps) {
  const [shapesOpen, setShapesOpen] = useState(false)
  const isShapeTool = SHAPE_TOOL_IDS.has(activeTool)
  const ActiveShapeIcon = SHAPE_TOOLS.find(t => t.id === activeTool)?.icon ?? Square

  const ToolBtn = ({
    id,
    icon: Icon,
    label,
    shortcut,
  }: {
    id: AnnotationTool
    icon: React.ElementType
    label: string
    shortcut: string
  }) => (
    <button
      draggable
      onDragStart={(e) => onDragStart(id, e)}
      onClick={() => onToolChange(id)}
      title={`${label} (${shortcut})`}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
        ${activeTool === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  )

  return (
    <div className="flex items-center gap-1 bg-white rounded-2xl shadow-lg border border-gray-200 px-2 py-2">
      {/* Navigation */}
      <ToolBtn id="select" icon={MousePointer2} label="Select" shortcut="V" />
      <ToolBtn id="hand" icon={Hand} label="Hand" shortcut="H" />

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Annotation tools */}
      <ToolBtn id="sticky_note" icon={StickyNote} label="Sticky Note" shortcut="S" />
      <ToolBtn id="text" icon={Type} label="Text" shortcut="T" />

      {/* Shapes with hover submenu */}
      <div
        className="relative"
        onMouseEnter={() => setShapesOpen(true)}
        onMouseLeave={() => setShapesOpen(false)}
      >
        <button
          draggable
          onDragStart={(e) => onDragStart(isShapeTool ? activeTool : 'rectangle', e)}
          onClick={() => {
            if (!isShapeTool) setShapesOpen(true)
          }}
          title="Shapes"
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative
            ${isShapeTool ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <ActiveShapeIcon className="h-5 w-5" />
          <ChevronUp className="h-2.5 w-2.5 absolute bottom-0.5 right-0.5 opacity-40" />
        </button>

        {shapesOpen && (
          <>
            {/* Invisible bridge fills the gap so mouseLeave doesn't fire mid-move */}
            <div className="absolute bottom-full left-0 w-full h-2" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-2">
              {SHAPE_TOOLS.map(({ id, icon: Icon, label, shortcut }) => (
                <button
                  key={id}
                  draggable
                  onDragStart={(e) => onDragStart(id, e)}
                  onClick={() => { onToolChange(id); setShapesOpen(false) }}
                  title={`${label} (${shortcut})`}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all
                    ${activeTool === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
