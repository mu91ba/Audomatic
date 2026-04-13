'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  NodeChange,
  SelectionMode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { PageNode } from './page-node'
import { GroupedPageNode } from './grouped-page-node'
import { StickyNoteNode, STICKY_NOTE_COLORS } from './sticky-note-node'
import { TextAnnotationNode } from './text-annotation-node'
import { ShapeNode } from './shape-node'
import { StandaloneFrameNode } from './standalone-frame-node'
import { DesignTokenPanel } from './design-token-panel'
import { AnnotationToolbar, AnnotationTool } from './annotation-toolbar'
import { calculateLayout } from '@/lib/layout'
import { supabase, type Page as PageType, type Annotation, type CanvasLayout } from '@/lib/supabase'
import { Palette } from 'lucide-react'
import { Button } from './ui/button'

// Register all node types
const nodeTypes = {
  pageNode: PageNode,
  groupedPageNode: GroupedPageNode,
  stickyNote: StickyNoteNode,
  textAnnotation: TextAnnotationNode,
  shapeNode: ShapeNode,
  standaloneFrame: StandaloneFrameNode,
}

interface AuditCanvasProps {
  auditId: string
  pages: PageType[]
  auditStatus: string
  userRole?: 'owner' | 'commenter'
  initialCanvasLayout?: CanvasLayout | null
}

// Wrapper component that provides ReactFlow context
export function AuditCanvas({ auditId, pages, auditStatus, userRole = 'owner', initialCanvasLayout }: AuditCanvasProps) {
  return (
    <ReactFlowProvider>
      <AuditCanvasInner
        auditId={auditId}
        pages={pages}
        auditStatus={auditStatus}
        userRole={userRole}
        initialCanvasLayout={initialCanvasLayout}
      />
    </ReactFlowProvider>
  )
}

// Inner component that can use useReactFlow hook
function AuditCanvasInner({ auditId, pages, auditStatus, userRole, initialCanvasLayout }: AuditCanvasProps) {
  // Get React Flow instance for coordinate conversion
  const { screenToFlowPosition, getNode } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [showDesignPanel, setShowDesignPanel] = useState(false)
  
  // Tool state
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  
  // Track page nodes separately from annotation nodes
  const pageNodesRef = useRef<Node[]>([])
  // Track IDs deleted locally so realtime events can't resurrect them
  const deletedIdsRef = useRef<Set<string>>(new Set())
  // Track selected annotation IDs via onSelectionChange (avoids stale nodes closure)
  const selectedAnnotationIdsRef = useRef<Set<string>>(new Set())

  // Persisted canvas layout (owner rearrangements) — keyed by node id
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayout>(initialCanvasLayout || {})
  const hydratedLayoutRef = useRef(false)
  const layoutDirtyRef = useRef(false)

  // Hydrate once when the parent delivers the audit's stored layout
  useEffect(() => {
    if (hydratedLayoutRef.current) return
    if (initialCanvasLayout === undefined) return
    hydratedLayoutRef.current = true
    if (initialCanvasLayout) setCanvasLayout(initialCanvasLayout)
  }, [initialCanvasLayout])

  // Persist layout to DB when the owner drags a node
  useEffect(() => {
    if (!layoutDirtyRef.current) return
    layoutDirtyRef.current = false
    supabase
      .from('audits')
      .update({ canvas_layout: canvasLayout })
      .eq('id', auditId)
      .then(({ error }) => {
        if (error) console.error('Error saving canvas layout:', error)
      })
  }, [canvasLayout, auditId])

  // Load annotations from Supabase
  const loadAnnotations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('annotations')
        .select('*')
        .eq('audit_id', auditId)
        .order('z_index', { ascending: true })

      if (error) throw error
      // Filter out anything already deleted locally
      setAnnotations((data || []).filter(a => !deletedIdsRef.current.has(a.id)))
    } catch (err) {
      console.error('Error loading annotations:', err)
    }
  }, [auditId])

  // Subscribe to annotation changes in real-time
  const subscribeToAnnotations = useCallback(() => {
    const subscription = supabase
      .channel(`annotations:${auditId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'annotations',
          filter: `audit_id=eq.${auditId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as Annotation
            // Ignore if we already deleted this locally
            if (deletedIdsRef.current.has(incoming.id)) return
            setAnnotations(prev =>
              prev.some(a => a.id === incoming.id) ? prev : [...prev, incoming]
            )
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Annotation
            if (deletedIdsRef.current.has(updated.id)) return
            setAnnotations(prev =>
              prev.map(a => a.id === updated.id ? updated : a)
            )
          } else if (payload.eventType === 'DELETE') {
            setAnnotations(prev => prev.filter(a => a.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [auditId])

  // Initialize annotations on mount
  useEffect(() => {
    loadAnnotations()
    const cleanup = subscribeToAnnotations()
    return cleanup
  }, [loadAnnotations, subscribeToAnnotations])

  // Convert annotations to React Flow nodes
  function annotationsToNodes(annotations: Annotation[]): Node[] {
    return annotations.map(annotation => {
      const baseNode = {
        id: `annotation-${annotation.id}`,
        position: { x: annotation.position_x, y: annotation.position_y },
        draggable: true,
      }

      switch (annotation.type) {
        case 'sticky_note':
          return {
            ...baseNode,
            type: 'stickyNote',
            data: {
              id: annotation.id,
              content: annotation.content || '',
              color: annotation.color,
              onContentChange: handleAnnotationContentChange,
              onDelete: handleAnnotationDelete,
              onColorChange: handleAnnotationColorChange,
            },
          }
        case 'text':
          return {
            ...baseNode,
            type: 'textAnnotation',
            data: {
              id: annotation.id,
              content: annotation.content || '',
              color: annotation.stroke_color,
              fontSize: annotation.font_size,
              onContentChange: handleAnnotationContentChange,
              onDelete: handleAnnotationDelete,
            },
          }
        case 'rectangle':
        case 'circle':
        case 'line':
        case 'arrow': {
          const w = annotation.width || (annotation.type === 'circle' ? 120 : 200)
          const h = annotation.height || (annotation.type === 'circle' ? 120 : (annotation.type === 'line' || annotation.type === 'arrow' ? 14 : 120))
          return {
            ...baseNode,
            type: 'shapeNode',
            style: { width: w, height: h },
            data: {
              id: annotation.id,
              shapeType: annotation.type,
              color: annotation.color,
              width: w,
              height: h,
              onDelete: handleAnnotationDelete,
            },
          }
        }
        default:
          return baseNode as Node
      }
    })
  }

  // Update nodes when pages, annotations, or stored layout change
  useEffect(() => {
    if (pages.length > 0) {
      const { nodes: layoutNodes, edges: layoutEdges } = calculateLayout(pages)
      const canDragPages = userRole === 'owner'
      pageNodesRef.current = layoutNodes.map(n => ({
        ...n,
        draggable: canDragPages,
        position: canvasLayout[n.id] ?? n.position,
      }))
      setEdges(layoutEdges)
    }

    // Combine page nodes with annotation nodes
    const annotationNodes = annotationsToNodes(annotations)
    setNodes([...pageNodesRef.current, ...annotationNodes])
  }, [pages, annotations, setNodes, setEdges, userRole, canvasLayout])

  // Handle annotation content change
  const handleAnnotationContentChange = useCallback(async (id: string, content: string) => {
    try {
      await supabase
        .from('annotations')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id)
    } catch (err) {
      console.error('Error updating annotation:', err)
    }
  }, [])

  // Handle annotation color change (sticky notes)
  const handleAnnotationColorChange = useCallback(async (id: string, color: string) => {
    // Optimistic update
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, color } : a))
    try {
      await supabase
        .from('annotations')
        .update({ color, updated_at: new Date().toISOString() })
        .eq('id', id)
    } catch (err) {
      console.error('Error updating annotation color:', err)
    }
  }, [])

  // Handle annotation delete — optimistic + permanent blacklist via ref
  const handleAnnotationDelete = useCallback(async (id: string) => {
    console.log('[DELETE] Attempting to delete annotation id:', id)
    deletedIdsRef.current.add(id)
    setAnnotations(prev => prev.filter(a => a.id !== id))
    const { data, error } = await supabase.from('annotations').delete().eq('id', id).select()
    console.log('[DELETE] Supabase result — data:', data, 'error:', error)
    if (error) console.error('[DELETE] Failed:', error.message)
  }, [])

  // Track which annotation nodes are selected (used by delete handler)
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    selectedAnnotationIdsRef.current = new Set(
      selectedNodes
        .filter(n => n.id.startsWith('annotation-'))
        .map(n => n.id.replace('annotation-', ''))
    )
  }, [])

  // Delete all selected annotation nodes
  const handleDeleteSelected = useCallback(() => {
    const idsToDelete = Array.from(selectedAnnotationIdsRef.current)
    console.log('[DELETE] handleDeleteSelected — ids to delete:', idsToDelete)
    idsToDelete.forEach(id => handleAnnotationDelete(id))
    selectedAnnotationIdsRef.current.clear()
  }, [handleAnnotationDelete])

  // Keyboard shortcuts for tools and delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Tool shortcuts
      switch (e.key.toLowerCase()) {
        case 'v':
          setActiveTool('select')
          break
        case 'h':
          setActiveTool('hand')
          break
        case 't':
          setActiveTool('text')
          break
        case 's':
          setActiveTool('sticky_note')
          break
        case 'r':
          setActiveTool('rectangle'); break
        case 'c':
          setActiveTool('circle'); break
        case 'l':
          setActiveTool('line'); break
        case 'a':
          setActiveTool('arrow'); break
        case 'delete':
        case 'backspace':
          // Delete selected annotation nodes (owner only)
          if (userRole === 'owner') handleDeleteSelected()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDeleteSelected])

  // Handle node position change (annotation drag -> annotations table,
  // page/group/frame drag -> audits.canvas_layout for owners)
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Call the default handler
    onNodesChange(changes)

    // Collect page-layout changes from this batch and flush as one state update
    const pageLayoutUpdates: Record<string, { x: number; y: number }> = {}

    changes.forEach(async (change) => {
      if (change.type !== 'position' || change.dragging !== false) return
      const nodeId = change.id
      // React Flow sometimes omits position on the drag-end change,
      // so read the current position straight from the node.
      const position = change.position ?? getNode(nodeId)?.position
      if (!position) return

      if (nodeId.startsWith('annotation-')) {
        const annotationId = nodeId.replace('annotation-', '')
        try {
          const { error } = await supabase
            .from('annotations')
            .update({
              position_x: position.x,
              position_y: position.y,
              updated_at: new Date().toISOString(),
            })
            .eq('id', annotationId)
          if (error) console.error('Error updating annotation position:', error)
        } catch (err) {
          console.error('Error updating annotation position:', err)
        }
      } else if (userRole === 'owner') {
        pageLayoutUpdates[nodeId] = { x: position.x, y: position.y }
      }
    })

    if (Object.keys(pageLayoutUpdates).length > 0) {
      layoutDirtyRef.current = true
      setCanvasLayout(prev => ({ ...prev, ...pageLayoutUpdates }))
    }
  }, [onNodesChange, userRole, getNode])

  // Shared function to create an annotation at a given flow position
  const createAnnotationAt = useCallback(async (
    tool: AnnotationTool,
    flowPosition: { x: number; y: number }
  ) => {
    const SHAPE_COLOR = '#64748b'
    type InsertData = {
      audit_id: string; type: string; position_x: number; position_y: number
      color: string; stroke_color: string; font_size: number; z_index: number
      content?: string; width?: number; height?: number; end_x?: number; end_y?: number
    }
    const base: InsertData = {
      audit_id: auditId,
      type: tool,
      position_x: flowPosition.x,
      position_y: flowPosition.y,
      color: tool === 'sticky_note' ? STICKY_NOTE_COLORS[0] : SHAPE_COLOR,
      stroke_color: '#000000',
      font_size: 16,
      z_index: annotations.length,
    }
    if (tool === 'sticky_note' || tool === 'text') {
      base.content = ''
    } else if (tool === 'rectangle') {
      base.width = 200; base.height = 120
    } else if (tool === 'circle') {
      base.width = 120; base.height = 120
    } else if (tool === 'line' || tool === 'arrow') {
      base.width = 200; base.height = 14
      base.end_x = flowPosition.x + 200; base.end_y = flowPosition.y
    }
    try {
      const { error } = await supabase.from('annotations').insert(base)
      if (error) throw error
    } catch (err) {
      console.error('Error creating annotation:', err)
    }
  }, [auditId, annotations.length])

  // Click on canvas to place annotation
  const handlePaneClick = useCallback(async (event: React.MouseEvent) => {
    const placementTools = ['text', 'sticky_note', 'rectangle', 'circle', 'line', 'arrow']
    if (!placementTools.includes(activeTool)) return
    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    await createAnnotationAt(activeTool, flowPosition)
    setActiveTool('select')
  }, [activeTool, screenToFlowPosition, createAnnotationAt])

  // Handle drag-from-toolbar drop onto canvas
  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    const tool = event.dataTransfer.getData('application/audomatic-tool') as AnnotationTool
    if (!tool) return
    const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    await createAnnotationAt(tool, flowPosition)
  }, [screenToFlowPosition, createAnnotationAt])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  // Handle drag start from toolbar
  const handleToolbarDragStart = useCallback((tool: AnnotationTool, e: React.DragEvent) => {
    e.dataTransfer.setData('application/audomatic-tool', tool)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  // Determine cursor style based on active tool
  const getCursorStyle = () => {
    switch (activeTool) {
      case 'hand':
        return 'grab'
      case 'text':
        return 'text'
      case 'sticky_note':
      case 'rectangle':
      case 'circle':
      case 'line':
      case 'arrow':
        return 'crosshair'
      default:
        return 'default'
    }
  }

  return (
    <div 
      className="relative w-full h-full" 
      style={{ cursor: getCursorStyle() }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onPaneClick={handlePaneClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onSelectionChange={handleSelectionChange}
        deleteKeyCode={null}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
        proOptions={{ hideAttribution: true }}
        panOnDrag={activeTool === 'hand'}
        selectionOnDrag={activeTool === 'select'}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={activeTool === 'select'}
        selectNodesOnDrag={false}
        multiSelectionKeyCode="Shift"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap 
          nodeColor={(node) => {
            if (node.type === 'stickyNote') return node.data.color || '#fef3c7'
            if (node.type === 'groupedPageNode') return '#c7d2fe'
            if (node.type === 'standaloneFrame') return '#f1f5f9'
            return '#e2e8f0'
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{
            backgroundColor: '#f8fafc',
          }}
        />
        
        {/* Bottom Center - FigJam-style Toolbar */}
        <Panel position="bottom-center" className="mb-4">
          <AnnotationToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onDragStart={handleToolbarDragStart}
          />
        </Panel>

        {/* Top Right Panel - Design Tokens button */}
        <Panel position="top-right" className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDesignPanel(!showDesignPanel)}
          >
            <Palette className="h-4 w-4 mr-2" />
            Design Tokens
          </Button>
        </Panel>

        {/* Empty state */}
        {pages.length === 0 && auditStatus !== 'failed' && (
          <Panel position="top-center" className="text-center mt-20">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="font-semibold text-lg mb-2">Crawling Started</h3>
              <p className="text-sm text-muted-foreground">
                Pages will appear here as they are discovered and processed.
                This may take a few minutes depending on the site size.
              </p>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Design Token Panel */}
      {showDesignPanel && (
        <DesignTokenPanel 
          auditId={auditId} 
          onClose={() => setShowDesignPanel(false)}
        />
      )}
    </div>
  )
}
