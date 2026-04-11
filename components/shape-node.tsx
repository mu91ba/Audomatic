'use client'

interface ShapeNodeProps {
  data: {
    id: string
    shapeType: 'rectangle' | 'circle' | 'line' | 'arrow'
    color: string
    width: number
    height: number
    onDelete: (id: string) => void
  }
}

export function ShapeNode({ data }: ShapeNodeProps) {
  const { id, shapeType, color, width, height } = data

  const fill = color + '33' // 20% opacity fill

  const renderShape = () => {
    if (shapeType === 'rectangle') {
      return (
        <div
          style={{
            width,
            height,
            backgroundColor: fill,
            border: `2px solid ${color}`,
            borderRadius: 4,
          }}
        />
      )
    }
    if (shapeType === 'circle') {
      return (
        <div
          style={{
            width,
            height,
            backgroundColor: fill,
            border: `2px solid ${color}`,
            borderRadius: '50%',
          }}
        />
      )
    }
    if (shapeType === 'line') {
      return (
        <svg width={width} height={4} style={{ overflow: 'visible', display: 'block' }}>
          <line x1={0} y1={2} x2={width} y2={2} stroke={color} strokeWidth={2} />
        </svg>
      )
    }
    if (shapeType === 'arrow') {
      return (
        <svg width={width} height={14} style={{ overflow: 'visible', display: 'block' }}>
          <defs>
            <marker
              id={`arrowhead-${id}`}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill={color} />
            </marker>
          </defs>
          <line
            x1={0}
            y1={7}
            x2={width - 4}
            y2={7}
            stroke={color}
            strokeWidth={2}
            markerEnd={`url(#arrowhead-${id})`}
          />
        </svg>
      )
    }
    return null
  }

  return (
    <div className="relative">
      {renderShape()}
    </div>
  )
}
