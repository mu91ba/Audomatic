/**
 * Derive the page tree from URL paths.
 *
 * The crawler seeds most URLs from the sitemap, which carries no hierarchy, so
 * every page is discovered "from" the homepage. `reparentPagesByUrlPath` in the
 * crawler already re-parents by URL path, but it can only attach a page to an
 * ancestor that was *itself crawled*. Date permalinks break that: for
 * /2026/07/20/some-post it tries /2026/07/20, /2026/07 and /2026, none of which
 * exist as pages, gives up, and falls back to the homepage. On sportbc.com that
 * left 58 of 62 pages as direct children of the homepage — one flat row, no
 * visible structure.
 *
 * So the missing ancestors are synthesised here as folder nodes. They are a
 * presentation concern, not data: no row is written, which also means existing
 * audits get the corrected tree on reload without being re-crawled.
 *
 * Runs of date segments collapse to the year (/2026/07/20/post sits under
 * /2026, not under /2026 -> /2026/07 -> /2026/07/20). Expanding them in full
 * would add three ranks of near-empty nodes per post that say nothing about how
 * the site is organised.
 */

/** 1999, 2026 — plausible permalink years, not arbitrary four-digit slugs. */
const YEAR_RE = /^(19|20)\d{2}$/
/** A month or day inside a date run: 7, 07, 20. */
const DATE_PART_RE = /^\d{1,2}$/

export type HierarchyEntry = {
  /** Graph node id this URL belongs to. */
  id: string
  url: string
}

export type FolderSpec = {
  id: string
  path: string
  /** What the card shows, e.g. "/2026". */
  label: string
  /** Direct children, for the card's subtitle. */
  childCount: number
  /** True when every segment of the path is part of a date run. */
  isDateFolder: boolean
}

export type UrlHierarchy = {
  folders: FolderSpec[]
  /** Node id -> parent node id. Absent or null means "top of the tree". */
  parentOf: Map<string, string | null>
  rootId: string | null
}

export const folderId = (path: string) => `folder:${path}`

/**
 * Collapse doubled slashes and drop a trailing slash.
 *
 * sportbc.com serves 9 of its links as https://sportbc.com//about, and
 * "//about" never matches "/about", so the ancestor walk missed real parents
 * and the canvas printed the doubled slash on the card.
 */
export function normalisePath(url: string): string {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    path = url
  }
  path = path.replace(/\/{2,}/g, '/')
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path || '/'
}

export function pathSegments(path: string): string[] {
  return normalisePath(path).split('/').filter(Boolean)
}

/**
 * Ancestor paths for a page, shallowest first, excluding the page itself.
 *
 *   /about                    -> []
 *   /fund/projects            -> ['/fund']
 *   /news/page/2              -> ['/news', '/news/page']
 *   /2026/07/20/some-post     -> ['/2026']
 *   /2026/07/20/cat/some-post -> ['/2026', '/2026/07/20/cat']
 */
export function urlAncestorPaths(url: string): string[] {
  const segments = pathSegments(url)
  const ancestors: string[] = []
  let i = 0

  // The final segment is the page itself, so it is never an ancestor.
  while (i < segments.length - 1) {
    if (YEAR_RE.test(segments[i])) {
      // Consume the whole date run but emit only the year, so every post in
      // 2026 shares one parent instead of one parent per calendar day.
      let j = i + 1
      while (j < segments.length - 1 && DATE_PART_RE.test(segments[j])) j++
      ancestors.push('/' + segments.slice(0, i + 1).join('/'))
      i = j
    } else {
      ancestors.push('/' + segments.slice(0, i + 1).join('/'))
      i++
    }
  }

  return ancestors
}

function isAllDateSegments(path: string): boolean {
  const segs = pathSegments(path)
  return segs.length > 0 && segs.every((s, i) => (i === 0 ? YEAR_RE.test(s) : DATE_PART_RE.test(s)))
}

/**
 * Build the parent map for a set of graph nodes, inventing folder nodes for any
 * ancestor path that no crawled page occupies.
 */
export function buildUrlHierarchy(entries: HierarchyEntry[]): UrlHierarchy {
  // Real pages win their path; a folder is only invented where none exists.
  const idByPath = new Map<string, string>()
  for (const entry of entries) {
    const path = normalisePath(entry.url)
    if (!idByPath.has(path)) idByPath.set(path, entry.id)
  }

  const rootId = idByPath.get('/') ?? null
  const folders = new Map<string, FolderSpec>()
  const parentOf = new Map<string, string | null>()

  const resolve = (path: string): string => {
    const existing = idByPath.get(path)
    if (existing) return existing
    const id = folderId(path)
    if (!folders.has(id)) {
      folders.set(id, {
        id,
        path,
        label: path,
        childCount: 0,
        isDateFolder: isAllDateSegments(path),
      })
    }
    return id
  }

  /** Attach one node to the deepest ancestor its URL implies. */
  const attach = (id: string, url: string) => {
    const chain = urlAncestorPaths(url)
    let parent: string | null = rootId
    for (const ancestorPath of chain) {
      const ancestorId = resolve(ancestorPath)
      // A page cannot be its own ancestor (/news is an ancestor path of
      // /news/page/2, but also a real page in its own right).
      if (ancestorId === id) break
      parent = ancestorId
    }
    parentOf.set(id, parent === id ? null : parent)
  }

  for (const entry of entries) {
    if (entry.id === rootId) {
      parentOf.set(entry.id, null)
      continue
    }
    attach(entry.id, entry.url)
  }

  // Folders need parents too, and resolving one can invent another, so keep
  // going until the set stops growing.
  const placed = new Set<string>()
  let pending = Array.from(folders.keys())
  while (pending.length > 0) {
    for (const id of pending) {
      placed.add(id)
      const spec = folders.get(id)!
      attach(id, spec.path)
    }
    pending = Array.from(folders.keys()).filter(id => !placed.has(id))
  }

  for (const parent of Array.from(parentOf.values())) {
    if (parent && folders.has(parent)) folders.get(parent)!.childCount++
  }

  return { folders: Array.from(folders.values()), parentOf, rootId }
}
