import { Node, Edge, MarkerType } from 'reactflow'
import dagre from 'dagre'
import { type Page } from './supabase'
import { detectUrlPattern } from './utils'

export { detectUrlPattern }

// Minimum number of pages with same pattern to group them
const MIN_PAGES_TO_GROUP = 4

/**
 * Group pages by URL pattern (e.g., all blog posts together)
 */
export function groupPagesByPattern(pages: Page[]): {
  individualPages: Page[]
  groupedPages: Map<string, Page[]>
} {
  // Count pages per pattern
  const patternCounts = new Map<string, Page[]>()
  
  for (const page of pages) {
    const pattern = detectUrlPattern(page.url)
    if (pattern) {
      if (!patternCounts.has(pattern)) {
        patternCounts.set(pattern, [])
      }
      patternCounts.get(pattern)!.push(page)
    }
  }
  
  // Separate into grouped and individual
  const groupedPages = new Map<string, Page[]>()
  const groupedUrls = new Set<string>()
  
  for (const [pattern, patternPages] of Array.from(patternCounts.entries())) {
    if (patternPages.length >= MIN_PAGES_TO_GROUP) {
      groupedPages.set(pattern, patternPages)
      patternPages.forEach(p => groupedUrls.add(p.url))
    }
  }
  
  // Pages not in any group
  const individualPages = pages.filter(p => !groupedUrls.has(p.url))
  
  return { individualPages, groupedPages }
}

/**
 * Calculate layout for pages using Dagre hierarchical layout
 * Creates a tree structure with homepage at top
 * Groups similar template pages together.
 * Pages with is_template=true (pre-grouped by crawler) are handled first;
 * the existing pattern-based grouping runs on the remaining pages.
 */
export function calculateLayout(pages: Page[]) {
  // Pages the crawler already flagged as template representatives
  const templatePages = pages.filter(p => p.is_template)

  // Non-template pages split into standalone (sitemap-only) vs linked
  const nonTemplatePages = pages.filter(p => !p.is_template)
  const standalonePages = nonTemplatePages.filter(p => p.source === 'sitemap_only')
  const linkedPages = nonTemplatePages.filter(p => p.source !== 'sitemap_only')

  // Regular linked pages go through the existing pattern-based grouping
  const { individualPages, groupedPages } = groupPagesByPattern(linkedPages)
  
  // Create dagre graph
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  // Configure layout
  dagreGraph.setGraph({
    rankdir: 'TB', // Top to bottom
    nodesep: 150, // Horizontal spacing between nodes
    ranksep: 200, // Vertical spacing between levels
    align: 'UL', // Alignment
  })

  const nodes: Node[] = []
  const edges: Edge[] = []

  // Create nodes for individual pages
  for (const page of individualPages) {
    nodes.push({
      id: page.id,
      type: 'pageNode',
      position: { x: 0, y: 0 }, // Will be calculated by dagre
      data: {
        url: page.url,
        title: page.title,
        screenshot_url: page.screenshot_url,
        level: page.level,
      },
    })
    // Tall height for dagre spacing; actual card height is determined by image
    dagreGraph.setNode(page.id, { width: 280, height: 900 })
  }

  // Create nodes for grouped pages
  for (const [pattern, groupPages] of Array.from(groupedPages.entries())) {
    // Use first page's ID as the group ID with prefix
    const groupId = `group-${pattern.replace(/[/*]/g, '_')}`
    const firstPage = groupPages[0]
    
    // Find the parent level (minimum level in the group minus 1)
    const minLevel = Math.min(...groupPages.map(p => p.level))
    
    nodes.push({
      id: groupId,
      type: 'groupedPageNode',
      position: { x: 0, y: 0 },
      data: {
        pattern: pattern,
        pages: groupPages.map(p => ({
          url: p.url,
          title: p.title,
          screenshot_url: p.screenshot_url,
        })),
        level: minLevel,
        representativeScreenshot: firstPage.screenshot_url,
      },
    })
    // Grouped nodes are slightly shorter since they have a smaller screenshot
    dagreGraph.setNode(groupId, { width: 280, height: 320 })
  }

  // Create nodes for template pages (pre-grouped by crawler)
  for (const page of templatePages) {
    const groupId = `template-${page.id}`
    const pattern = detectUrlPattern(page.url) || page.url

    // Build pages array from template_urls if available, otherwise just the representative
    const groupPages = page.template_urls
      ? page.template_urls.map(url => ({ url, title: '', screenshot_url: '' }))
      : [{ url: page.url, title: page.title, screenshot_url: page.screenshot_url }]

    nodes.push({
      id: groupId,
      type: 'groupedPageNode',
      position: { x: 0, y: 0 },
      data: {
        pattern,
        pages: groupPages,
        count: page.template_count ?? 1,
        level: page.level,
        representativeScreenshot: page.screenshot_url,
      },
    })
    dagreGraph.setNode(groupId, { width: 280, height: 320 })
  }

  // Create a map of URL to node ID (including groups)
  const urlToNodeId = new Map<string, string>()
  
  // Map individual pages
  for (const page of individualPages) {
    urlToNodeId.set(page.url, page.id)
  }
  
  // Map grouped pages to their group node
  for (const [pattern, groupPages] of Array.from(groupedPages.entries())) {
    const groupId = `group-${pattern.replace(/[/*]/g, '_')}`
    for (const page of groupPages) {
      urlToNodeId.set(page.url, groupId)
    }
  }

  // Map template pages (pre-grouped by crawler)
  for (const page of templatePages) {
    urlToNodeId.set(page.url, `template-${page.id}`)
  }

  // Create edges based on parent-child relationships
  const createdEdges = new Set<string>() // Track edges to avoid duplicates
  
  // Edges for individual pages
  for (const page of individualPages) {
    if (page.parent_url) {
      const parentNodeId = urlToNodeId.get(page.parent_url)
      const childNodeId = page.id
      
      if (parentNodeId && parentNodeId !== childNodeId) {
        const edgeKey = `${parentNodeId}-${childNodeId}`
        if (!createdEdges.has(edgeKey)) {
          edges.push(createEdge(parentNodeId, childNodeId))
          dagreGraph.setEdge(parentNodeId, childNodeId)
          createdEdges.add(edgeKey)
        }
      }
    }
  }

  // Edges for template pages (pre-grouped by crawler)
  for (const page of templatePages) {
    const groupId = `template-${page.id}`
    if (page.parent_url) {
      const parentNodeId = urlToNodeId.get(page.parent_url)
      if (parentNodeId && parentNodeId !== groupId) {
        const edgeKey = `${parentNodeId}-${groupId}`
        if (!createdEdges.has(edgeKey)) {
          edges.push(createEdge(parentNodeId, groupId))
          dagreGraph.setEdge(parentNodeId, groupId)
          createdEdges.add(edgeKey)
        }
      }
    }
  }

  // Edges for grouped pages (connect to parent of the group)
  for (const [pattern, groupPages] of Array.from(groupedPages.entries())) {
    const groupId = `group-${pattern.replace(/[/*]/g, '_')}`
    
    // Find a parent for this group (use the parent of the first page that has one)
    for (const page of groupPages) {
      if (page.parent_url) {
        const parentNodeId = urlToNodeId.get(page.parent_url)
        
        // Only connect if parent is not in the same group
        if (parentNodeId && parentNodeId !== groupId) {
          const edgeKey = `${parentNodeId}-${groupId}`
          if (!createdEdges.has(edgeKey)) {
            edges.push(createEdge(parentNodeId, groupId))
            dagreGraph.setEdge(parentNodeId, groupId)
            createdEdges.add(edgeKey)
          }
          break // Only need one edge to parent
        }
      }
    }
  }

  // Calculate layout
  dagre.layout(dagreGraph)

  // Apply calculated positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    if (!nodeWithPosition) {
      return {
        ...node,
        position: { x: 0, y: 0 },
      }
    }
    const height = node.type === 'groupedPageNode' ? 320 : 900
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 140, // Center the node (half of width: 280/2)
        y: nodeWithPosition.y - height / 2,
      },
    }
  })

  // Position standalone pages to the RIGHT of the tree, level with the home node
  const standaloneNodes: Node[] = []
  if (standalonePages.length > 0) {
    const CARD_WIDTH = 280
    const CARD_GAP = 50
    const FRAME_PADDING = 40
    const CARD_HEIGHT = 900
    const FRAME_GAP = 300 // horizontal gap between tree and standalone frame

    // Find the rightmost edge of the entire tree
    const mainTreeMaxX = layoutedNodes.reduce((max, node) => {
      return Math.max(max, node.position.x + 280)
    }, 0)

    // Find the home node (level 0) to align frame vertically with it
    const homeNode = layoutedNodes.find(n => n.data?.level === 0)
      ?? layoutedNodes.reduce((top, n) => n.position.y < top.position.y ? n : top, layoutedNodes[0])

    // Frame dimensions and position (right of tree, aligned to home node Y)
    const frameWidth = standalonePages.length * (CARD_WIDTH + CARD_GAP) - CARD_GAP + FRAME_PADDING * 2
    const frameHeight = CARD_HEIGHT + FRAME_PADDING * 2 + 40 // extra 40 for label
    const frameX = mainTreeMaxX + FRAME_GAP
    const frameY = homeNode ? homeNode.position.y : 0

    // Frame background node
    standaloneNodes.push({
      id: 'standalone-frame',
      type: 'standaloneFrame',
      position: { x: frameX, y: frameY },
      style: { width: frameWidth, height: frameHeight },
      data: { width: frameWidth, height: frameHeight },
      draggable: true,
      selectable: true,
      zIndex: -1,
    })

    // Individual standalone page nodes inside the frame (positions relative to frame)
    standalonePages.forEach((page, i) => {
      standaloneNodes.push({
        id: page.id,
        type: 'pageNode',
        position: {
          x: FRAME_PADDING + i * (CARD_WIDTH + CARD_GAP),
          y: FRAME_PADDING + 40, // offset for frame label
        },
        parentId: 'standalone-frame',
        extent: 'parent' as const,
        data: {
          url: page.url,
          title: page.title,
          screenshot_url: page.screenshot_url,
          level: page.level,
        },
      })
    })
  }

  return {
    nodes: [...layoutedNodes, ...standaloneNodes],
    edges,
  }
}

/**
 * Helper to create a styled edge
 */
function createEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#94a3b8',
      width: 20,
      height: 20,
    },
  }
}
