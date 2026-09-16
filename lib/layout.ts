import { Node, Edge, MarkerType } from 'reactflow'
import dagre from 'dagre'
import { type Page } from './supabase'
import { detectUrlPattern } from './utils'
import { buildUrlHierarchy, type HierarchyEntry } from './hierarchy'

export { detectUrlPattern }

// Minimum number of pages with same pattern to group them
const MIN_PAGES_TO_GROUP = 4

// Dagre needs a height per node to space ranks. Page cards are tall because the
// screenshot is full-page; group cards and folder cards are not.
const PAGE_HEIGHT = 900
const GROUP_HEIGHT = 320
const FOLDER_HEIGHT = 90

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
    dagreGraph.setNode(page.id, { width: 280, height: PAGE_HEIGHT })
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
    dagreGraph.setNode(groupId, { width: 280, height: GROUP_HEIGHT })
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
    dagreGraph.setNode(groupId, { width: 280, height: GROUP_HEIGHT })
  }

  // ------------------------------------------------------------------
  // Parent every node by its URL path.
  //
  // This used to read page.parent_url, which the crawler sets to the nearest
  // ancestor it actually crawled. Date permalinks have no crawled ancestor
  // (/2026 and /2026/07 are archive routes, not pages), so those pages fell
  // back to the homepage and the whole site drew as one flat row. See
  // lib/hierarchy.ts — missing ancestors become folder nodes instead.
  // ------------------------------------------------------------------
  const entries: HierarchyEntry[] = []

  for (const page of individualPages) {
    entries.push({ id: page.id, url: page.url })
  }
  for (const [pattern, groupPages] of Array.from(groupedPages.entries())) {
    // A group sits where its members sit, so any member's URL places it.
    entries.push({ id: `group-${pattern.replace(/[/*]/g, '_')}`, url: groupPages[0].url })
  }
  for (const page of templatePages) {
    entries.push({ id: `template-${page.id}`, url: page.url })
  }

  const { folders, parentOf } = buildUrlHierarchy(entries)

  // Folder nodes are shorter than page cards — they carry no screenshot.
  for (const folder of folders) {
    nodes.push({
      id: folder.id,
      type: 'folderNode',
      position: { x: 0, y: 0 },
      data: {
        label: folder.label,
        childCount: folder.childCount,
        isDateFolder: folder.isDateFolder,
      },
    })
    dagreGraph.setNode(folder.id, { width: 280, height: FOLDER_HEIGHT })
  }

  const createdEdges = new Set<string>()
  for (const [childId, parentId] of Array.from(parentOf.entries())) {
    if (!parentId || parentId === childId) continue
    const edgeKey = `${parentId}-${childId}`
    if (createdEdges.has(edgeKey)) continue
    edges.push(createEdge(parentId, childId))
    dagreGraph.setEdge(parentId, childId)
    createdEdges.add(edgeKey)
  }

  // Calculate layout
  dagre.layout(dagreGraph)

  const heightOf = (node: Node) =>
    node.type === 'folderNode' ? FOLDER_HEIGHT
    : node.type === 'groupedPageNode' ? GROUP_HEIGHT
    : PAGE_HEIGHT

  // Dagre returns each node's centre, and a rank's centre line is shared by
  // every node in it. Positioning each card at centre - itsOwnHeight/2 would
  // leave a 90px folder floating in the middle of a row of 900px page cards.
  // Cards are top-aligned instead, so a row reads as a row.
  const rankTop = new Map<number, number>()
  for (const node of nodes) {
    const positioned = dagreGraph.node(node.id)
    if (!positioned) continue
    const centre = Math.round(positioned.y)
    const top = centre - heightOf(node) / 2
    const current = rankTop.get(centre)
    if (current === undefined || top < current) rankTop.set(centre, top)
  }

  // Apply calculated positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    if (!nodeWithPosition) {
      return {
        ...node,
        position: { x: 0, y: 0 },
      }
    }
    const centre = Math.round(nodeWithPosition.y)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 140, // Center the node (half of width: 280/2)
        y: rankTop.get(centre) ?? nodeWithPosition.y - heightOf(node) / 2,
      },
    }
  })

  // Position standalone pages to the RIGHT of the tree, level with the home node
  const standaloneNodes: Node[] = []
  if (standalonePages.length > 0) {
    const CARD_WIDTH = 280
    const CARD_GAP = 50
    const FRAME_PADDING = 40
    const CARD_HEIGHT = PAGE_HEIGHT
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
