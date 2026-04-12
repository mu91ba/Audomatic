'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, type Audit, type AuditShare } from '@/lib/supabase'
import { useAuth } from '@/components/auth/auth-provider'
import { isInvitee } from '@/lib/role'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Loader2,
  Plus,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Users
} from 'lucide-react'

type AuditWithOwnership = Audit & { isOwner: boolean }

export default function AuditsPage() {
  const [audits, setAudits] = useState<AuditWithOwnership[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      loadAudits()
    }
  }, [user])

  async function loadAudits() {
    try {
      // Load own audits
      const { data: ownAudits, error: ownError } = await supabase
        .from('audits')
        .select('*')
        .order('created_at', { ascending: false })

      if (ownError) throw ownError

      // Load shared audits via audit_shares
      const { data: shares } = await supabase
        .from('audit_shares')
        .select('audit_id')

      const sharedAuditIds = new Set((shares || []).map(s => s.audit_id))

      // Mark ownership
      const allAudits: AuditWithOwnership[] = (ownAudits || []).map(a => ({
        ...a,
        isOwner: a.user_id === user?.id || a.user_id === null,
      }))

      setAudits(allAudits)
    } catch (err) {
      console.error('Error loading audits:', err)
    } finally {
      setLoading(false)
    }
  }

  async function deleteAudit(auditId: string) {
    if (!confirm('Are you sure you want to delete this audit? This action cannot be undone.')) {
      return
    }

    setDeleting(auditId)
    try {
      const { data, error } = await supabase
        .from('audits')
        .delete()
        .eq('id', auditId)
        .select()

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('Delete was blocked — you may not have permission to delete this audit.')
      }
      setAudits(audits.filter(a => a.id !== auditId))
    } catch (err: any) {
      console.error('Error deleting audit:', err)
      alert(err?.message || 'Failed to delete audit')
    } finally {
      setDeleting(null)
    }
  }

  // Format date for display
  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Get status badge styling
  function getStatusBadge(audit: Audit) {
    const effectivelyComplete =
      audit.status === 'completed' ||
      (audit.status === 'processing' &&
        (audit.total_pages ?? 0) > 0 &&
        audit.processed_pages === audit.total_pages)

    if (effectivelyComplete) {
      return {
        className: 'bg-green-100 text-green-700',
        icon: <CheckCircle2 className="h-3 w-3" />,
        label: 'Completed',
      }
    }

    switch (audit.status) {
      case 'completed':
        return {
          className: 'bg-green-100 text-green-700',
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Completed',
        }
      case 'processing':
        return {
          className: 'bg-blue-100 text-blue-700',
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          label: 'Processing',
        }
      case 'failed':
        return {
          className: 'bg-red-100 text-red-700',
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Failed',
        }
      default:
        return {
          className: 'bg-gray-100 text-gray-700',
          icon: <Clock className="h-3 w-3" />,
          label: 'Pending',
        }
    }
  }

  // Extract domain from URL for display
  function getDomain(url: string) {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  const userIsInvitee = isInvitee(user)

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AppHeader homeHref="/audits" />

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              {userIsInvitee ? 'Shared with me' : 'My Audits'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {userIsInvitee
                ? 'Audits collaborators have shared with you'
                : 'View and manage your website audits'}
            </p>
          </div>
          {!userIsInvitee && (
            <Link href="/">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Audit
              </Button>
            </Link>
          )}
        </div>

        {audits.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-semibold mb-2">
                  {userIsInvitee ? 'Nothing shared with you yet' : 'No audits yet'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {userIsInvitee
                    ? "When someone shares an audit with you, it'll appear here."
                    : 'Start your first website audit to see it here'}
                </p>
                {!userIsInvitee && (
                  <Link href="/">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Start New Audit
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {audits.map((audit) => {
              const statusBadge = getStatusBadge(audit)
              return (
                <Card key={audit.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/audit/${audit.id}`}
                            className="font-semibold text-lg hover:text-primary transition-colors truncate"
                          >
                            {getDomain(audit.url)}
                          </Link>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.className}`}>
                            {statusBadge.icon}
                            {statusBadge.label}
                          </span>
                          {!audit.isOwner && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              <Users className="h-3 w-3" />
                              Shared
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="truncate max-w-md">{audit.url}</span>
                          <span>•</span>
                          <span>{formatDate(audit.created_at)}</span>
                          {audit.total_pages && (
                            <>
                              <span>•</span>
                              <span>{audit.total_pages} pages</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <a
                          href={audit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                          title="Visit website"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <Link href={`/audit/${audit.id}`}>
                          <Button variant="secondary" size="sm">
                            View Audit
                          </Button>
                        </Link>
                        {audit.isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => deleteAudit(audit.id)}
                            disabled={deleting === audit.id}
                            title="Delete audit"
                          >
                            {deleting === audit.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

