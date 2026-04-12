'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, Globe } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { LoginForm } from '@/components/auth/login-form'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { isInvitee } from '@/lib/role'

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Invitees can't create audits — send them to the shared-audits list instead.
  useEffect(() => {
    if (!loading && user && isInvitee(user)) {
      router.replace('/audits')
    }
  }, [loading, user, router])

  // Show loading state while checking auth
  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    )
  }

  // If user is a logged-in account holder, show the audit creation form
  if (user && !isInvitee(user)) {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      setError('')
      setSubmitting(true)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const response = await fetch('/api/start-audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
          body: JSON.stringify({ url }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to start audit')
        }

        router.push(`/audit/${data.auditId}`)
      } catch (err: any) {
        setError(err.message || 'An error occurred')
        setSubmitting(false)
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <AppHeader />
        <main className="flex flex-col items-center justify-center p-6 pt-20">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="h-8 w-8 text-primary" />
                <h1 className="text-4xl font-bold tracking-tight">Audomatic</h1>
              </div>
              <p className="text-lg text-muted-foreground">
                Start a new website audit
              </p>
            </div>

            <Card className="w-full max-w-md shadow-lg">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">New Audit</CardTitle>
                <CardDescription>
                  Enter a website URL to begin auditing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="url"
                        placeholder="https://example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={submitting}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={submitting || !url}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting Audit...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Start Audit
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="p-2">
                <div className="text-xl mb-1">🗺️</div>
                <p className="text-muted-foreground">Visual Sitemaps</p>
              </div>
              <div className="p-2">
                <div className="text-xl mb-1">🎨</div>
                <p className="text-muted-foreground">Design Tokens</p>
              </div>
              <div className="p-2">
                <div className="text-xl mb-1">📝</div>
                <p className="text-muted-foreground">Annotations</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // While the invitee redirect is in flight, show a spinner.
  if (user && isInvitee(user)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    )
  }

  // Logged out — show login form
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AppHeader />
      <main className="flex flex-col items-center justify-center p-6 pt-20">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold tracking-tight">Audomatic</h1>
            </div>
            <p className="text-lg text-muted-foreground">
              Automated website audits with visual sitemaps
            </p>
          </div>

          <div id="login">
            <LoginForm />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="p-2">
              <div className="text-xl mb-1">🗺️</div>
              <p className="text-muted-foreground">Visual Sitemaps</p>
            </div>
            <div className="p-2">
              <div className="text-xl mb-1">🎨</div>
              <p className="text-muted-foreground">Design Tokens</p>
            </div>
            <div className="p-2">
              <div className="text-xl mb-1">📝</div>
              <p className="text-muted-foreground">Annotations</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
