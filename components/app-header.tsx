'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { UserMenu } from '@/components/auth/user-menu'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  homeHref?: string
  rightContent?: ReactNode
}

export function AppHeader({ homeHref = '/', rightContent }: AppHeaderProps) {
  const { user, loading } = useAuth()

  return (
    <header className="border-b bg-background px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">Audomatic</span>
        </Link>
        <div className="flex items-center gap-3">
          {rightContent}
          {!loading &&
            (user ? (
              <UserMenu />
            ) : (
              <a href="#login">
                <Button variant="outline" size="sm">
                  Log in
                </Button>
              </a>
            ))}
        </div>
      </div>
    </header>
  )
}
