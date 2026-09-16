import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely extract pathname from a URL string
 * Returns the original string if URL parsing fails.
 *
 * Doubled slashes are collapsed: sportbc.com links to //about as often as
 * /about, and the card printed the raw "//about" back at the reader.
 */
export function getPathname(url: string): string {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return url
  }
  path = path.replace(/\/{2,}/g, '/')
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path || '/'
}

/**
 * Detect URL pattern for grouping similar pages
 * Returns pattern like "/blog/*" or null if no pattern detected
 */
export function detectUrlPattern(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const segments = urlObj.pathname.split('/').filter(s => s.length > 0)
    if (segments.length < 2) return null
    return '/' + segments.slice(0, -1).join('/') + '/*'
  } catch {
    return null
  }
}
