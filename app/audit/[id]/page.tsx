'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, type Audit, type Page as PageType } from '@/lib/supabase'
import { AuditCanvas } from '@/components/audit-canvas'
import { Loader2, AlertCircle, CheckCircle2, Home, Sheet, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/auth/user-menu'
import { ShareModal } from '@/components/share-modal'
import { useAuth } from '@/components/auth/auth-provider'

export default function AuditPage() {
  const params = useParams()
  const auditId = params.id as string

  const [audit, setAudit] = useState<Audit | null>(null)
  const [pages, setPages] = useState<PageType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showCompleteToast, setShowCompleteToast] = useState(false)
  const wasCompleteRef = useRef(false)
  const { user } = useAuth()

  const isOwner = audit?.user_id === user?.id || audit?.user_id === null

  // Helper to determine if audit is effectively complete
  const isEffectivelyComplete =
    audit?.status === 'completed' ||
    (audit?.status === 'processing' &&
     audit.total_pages &&
     audit.total_pages > 0 &&
     audit.processed_pages === audit.total_pages)

  useEffect(() => {
    loadAuditData()
    const cleanup = subscribeToUpdates()
    return cleanup
  }, [auditId])

  // Show "Complete" toast when status transitions to complete
  useEffect(() => {
    if (isEffectivelyComplete && !wasCompleteRef.current) {
      wasCompleteRef.current = true
      setShowCompleteToast(true)
      const timer = setTimeout(() => setShowCompleteToast(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [isEffectivelyComplete])

  async function loadAuditData() {
    try {
      // Load audit
      const { data: auditData, error: auditError } = await supabase
        .from('audits')
        .select('*')
        .eq('id', auditId)
        .single()

      if (auditError) throw auditError
      setAudit(auditData)

      // Load pages
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('*')
        .eq('audit_id', auditId)
        .order('level', { ascending: true })

      if (pagesError) throw pagesError
      setPages(pagesData || [])

      setLoading(false)
    } catch (err: any) {
      console.error('Error loading audit:', err)
      setError(err.message || 'Failed to load audit')
      setLoading(false)
    }
  }

  function subscribeToUpdates() {
    // Subscribe to pages table for real-time updates
    const pagesSubscription = supabase
      .channel(`pages:${auditId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pages',
          filter: `audit_id=eq.${auditId}`,
        },
        (payload) => {
          setPages((prev) => [...prev, payload.new as PageType])
        }
      )
      .subscribe()

    // Subscribe to audit status changes
    const auditSubscription = supabase
      .channel(`audit:${auditId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'audits',
          filter: `id=eq.${auditId}`,
        },
        (payload) => {
          setAudit(payload.new as Audit)
        }
      )
      .subscribe()

    // Cleanup subscriptions
    return () => {
      pagesSubscription.unsubscribe()
      auditSubscription.unsubscribe()
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading audit...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
              <div>
                <h2 className="text-lg font-semibold">Error Loading Audit</h2>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  async function handleExportToSheets() {
    setExporting(true)
    setExportError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')
      const res = await fetch('/api/export-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ auditId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Export failed')
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      setExportError(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // Helper to get display status text
  const getStatusText = () => {
    if (audit?.status === 'pending') return 'Waiting to start...'
    if (audit?.status === 'failed') return 'Failed'
    if (isEffectivelyComplete) return `Completed - ${pages.length} pages`
    if (audit?.status === 'processing') return `Processing... (${pages.length} pages crawled)`
    return ''
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Home button */}
            <Link href="/audits">
              <Button variant="ghost" size="icon" title="Back to audits">
                <Home className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">
                {audit?.url || 'Audit'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {getStatusText()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Show spinner and progress only when actually processing */}
            {audit?.status === 'processing' && !isEffectivelyComplete && (
              <div className="flex items-center gap-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                {/* Progress bar */}
                {audit.total_pages && audit.total_pages > 0 ? (
                  <div className="w-48">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ 
                          width: `${Math.round(((audit.processed_pages || 0) / audit.total_pages) * 100)}%` 
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground mt-1 block">
                      {audit.processed_pages || 0} / {audit.total_pages} pages
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Discovering pages...</span>
                )}
              </div>
            )}
            {/* Shared badge for non-owners */}
            {!isOwner && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                <Users className="h-3 w-3" />
                Shared with you
              </span>
            )}
            {/* Complete toast — shows briefly then disappears */}
            {showCompleteToast && (
              <div className="flex items-center gap-2 text-green-600 font-medium animate-in fade-in duration-300">
                <CheckCircle2 className="h-5 w-5" />
                <span>Complete</span>
              </div>
            )}
            {/* Export button — always visible when complete (owner only) */}
            {isEffectivelyComplete && isOwner && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToSheets}
                  disabled={exporting}
                  title="Export audit data to Google Sheets"
                >
                  {exporting
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <Sheet className="h-4 w-4 mr-2" />
                  }
                  {exporting ? 'Exporting...' : 'Export to Sheets'}
                </Button>
                {exportError && (
                  <span className="text-sm text-destructive">{exportError}</span>
                )}
              </>
            )}
            {/* Share button - owner only */}
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShareModal(true)}
                title="Share this audit"
              >
                <Users className="h-4 w-4 mr-2" />
                Share
              </Button>
            )}
            {/* User menu */}
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1">
        <AuditCanvas auditId={auditId} pages={pages} auditStatus={audit?.status || 'pending'} userRole={isOwner ? 'owner' : 'commenter'} />
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal auditId={auditId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  )
}

