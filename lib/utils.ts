import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely extract pathname from a URL string
 * Returns the original string if URL parsing fails
 */
export function getPathname(url: string): string {
  try {
    return new URL(url).pathname || '/'
  } catch {
    return url
  }
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
