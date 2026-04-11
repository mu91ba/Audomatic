'use client'

import { memo, useState, useRef, useEffect } from 'react'
import { NodeProps } from 'reactflow'

interface TextAnnotationData {
  id: string
  content: string
  color: string
  fontSize: number
  onContentChange: (id: string, content: string) => void
  onDelete: (id: string) => void
}

export const TextAnnotationNode = memo(({ data, selected }: NodeProps<TextAnnotationData>) => {
  const [isEditing, setIsEditing] = useState(false)
  const [localContent, setLocalContent] = useState(data.content)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Sync local content when data changes
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
      setLocalContent(data.content) // Revert changes
      setIsEditing(false)
    }
    if (e.key === 'Enter') {
      handleBlur()
    }
  }

  return (
    <div
      className={`relative inline-block ${
        selected ? 'ring-2 ring-primary ring-offset-2 rounded' : ''
      }`}
    >
      {/* Content */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="bg-transparent border-b-2 border-dashed border-gray-400 outline-none min-w-[100px]"
          style={{ 
            color: data.color || '#000000',
            fontSize: `${data.fontSize || 16}px`,
            fontFamily: 'Inter, sans-serif',
          }}
          placeholder="Type here..."
        />
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className="cursor-text font-medium"
          style={{ 
            color: data.color || '#000000',
            fontSize: `${data.fontSize || 16}px`,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {localContent || (
            <span className="text-gray-400 italic">Click to add text...</span>
          )}
        </div>
      )}
    </div>
  )
})

TextAnnotationNode.displayName = 'TextAnnotationNode'

