'use client'

import { memo, useState, useRef, useEffect } from 'react'
import { NodeProps } from 'reactflow'

interface StickyNoteData {
  id: string
  content: string
  color: string
  onContentChange: (id: string, content: string) => void
  onDelete: (id: string) => void
  onColorChange: (id: string, color: string) => void
}

// Predefined sticky note colors (pastel tones)
export const STICKY_NOTE_COLORS = [
  '#fef3c7', // Yellow (default)
  '#fce7f3', // Pink
  '#dbeafe', // Blue
  '#d1fae5', // Green
  '#f3e8ff', // Purple
  '#fed7aa', // Orange
]

export const StickyNoteNode = memo(({ data, selected }: NodeProps<StickyNoteData>) => {
  const [isEditing, setIsEditing] = useState(false)
  const [localContent, setLocalContent] = useState(data.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    setLocalContent(data.content)
  }, [data.content])

  const handleBlur = () => {
    setIsEditing(false)
    if (localContent !== data.content) {
      data.onContentChange(data.id, localContent)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setLocalContent(data.content)
      setIsEditing(false)
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleBlur()
    }
  }

  return (
    <div className="relative">
      <div
        className={`relative rounded-sm shadow-md transition-shadow ${
          selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
        }`}
        style={{
          backgroundColor: data.color || STICKY_NOTE_COLORS[0],
          minWidth: '150px',
          minHeight: '100px',
        }}
      >
        {/* Folded corner effect */}
        <div
          className="absolute top-0 right-0 w-6 h-6"
          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.1) 50%)' }}
        />

        {/* Content */}
        <div className="p-3 pr-6">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[80px] bg-transparent border-none resize-none outline-none text-sm"
              placeholder="Add a note..."
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="min-h-[80px] text-sm cursor-text whitespace-pre-wrap"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {localContent || (
                <span className="text-gray-400 italic">Click to add note...</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Color picker — appears below when selected */}
      {selected && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex items-center gap-1.5 bg-white rounded-xl shadow-lg border border-gray-200 px-2.5 py-2 z-10">
          {STICKY_NOTE_COLORS.map((color) => (
            <button
              key={color}
              onClick={(e) => { e.stopPropagation(); data.onColorChange(data.id, color) }}
              className={`w-5 h-5 rounded-full transition-all border-2 hover:scale-110 ${
                data.color === color ? 'border-gray-800 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  )
})

StickyNoteNode.displayName = 'StickyNoteNode'
