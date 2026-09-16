'use client'

import { Linkedin } from 'lucide-react'

/**
 * Credit line shown at the foot of the pages someone lands on: sign-in, apply,
 * and the audit list.
 */
export function BuiltBy({ className = '' }: { className?: string }) {
  return (
    <footer className={`py-6 text-center text-sm text-muted-foreground ${className}`}>
      Built by{' '}
      <a
        href="https://www.linkedin.com/in/mu91ba/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:text-primary hover:underline transition-colors"
      >
        Muneeba
        <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">(opens LinkedIn in a new tab)</span>
      </a>
    </footer>
  )
}
