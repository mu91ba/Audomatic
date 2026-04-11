'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from './auth-provider'
import { Button } from '@/components/ui/button'
import { User, LogOut, ChevronDown, FolderOpen } from 'lucide-react'
import Link from 'next/link'

export function UserMenu() {
  const { user, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!user) return null

  const handleSignOut = async () => {
    setIsOpen(false)
    await signOut()
  }

  // Get display name - use email before @ symbol
  const displayName = user.email?.split('@')[0] || 'User'

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
      >
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
        <span className="max-w-[120px] truncate text-sm">{displayName}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border py-1 z-50">
          {/* User email */}
          <div className="px-4 py-2 border-b">
            <p className="text-sm font-medium truncate">{user.email}</p>
            <p className="text-xs text-muted-foreground">Signed in</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              href="/audits"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              My Audits
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t py-1">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}



