'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/auth/auth-provider'
import { isAdmin, type AppRole } from '@/lib/role'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Check, X, ShieldCheck, Mail, Clock } from 'lucide-react'

type AccessRequest = {
  id: string
  email: string
  name: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
}

type AccountRow = {
  id: string
  email: string
  role: AppRole
  created_at: string
}

type Tab = 'applications' | 'accounts'

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

const ROLE_BADGE: Record<AppRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  member: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-700',
}

export default function AdminPage() {
  const { user, role, loading: authLoading } = useAuth()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('applications')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // The API routes check admin themselves; this only avoids rendering a page
  // full of requests that would all come back 403.
  useEffect(() => {
    if (authLoading) return
    if (!user) router.replace('/')
    else if (!isAdmin(role)) router.replace('/audits')
  }, [authLoading, user, role, router])

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Not authenticated')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const headers = await authHeaders()
      const [requestsRes, usersRes] = await Promise.all([
        fetch('/api/admin/access-requests', { headers }),
        fetch('/api/admin/users', { headers }),
      ])
      const requestsData = await requestsRes.json()
      const usersData = await usersRes.json()
      if (!requestsRes.ok) throw new Error(requestsData.error || 'Failed to load applications')
      if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load accounts')
      setRequests(requestsData.requests || [])
      setAccounts(usersData.users || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  useEffect(() => {
    if (!authLoading && user && isAdmin(role)) load()
  }, [authLoading, user, role, load])

  async function review(requestId: string, action: 'approve' | 'reject') {
    setBusyId(requestId)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/access-requests', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ requestId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      if (data.warning) setNotice(data.warning)
      else if (action === 'approve') {
        setNotice(
          data.invited
            ? 'Approved — an invite email is on its way.'
            : 'Approved — that address already had an account, so it was upgraded to Member.'
        )
      } else {
        setNotice('Application rejected.')
      }
      await load()
    } catch (err: any) {
      setError(err.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function changeRole(userId: string, nextRole: AppRole) {
    setBusyId(userId)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ userId, role: nextRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not change the role')
      setAccounts(prev => prev.map(a => (a.id === userId ? { ...a, role: nextRole } : a)))
      setNotice(`Role updated to ${ROLE_LABELS[nextRole]}.`)
    } catch (err: any) {
      setError(err.message || 'Could not change the role')
    } finally {
      setBusyId(null)
    }
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (authLoading || !user || !isAdmin(role)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const pending = requests.filter(r => r.status === 'pending')
  const reviewed = requests.filter(r => r.status !== 'pending')

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AppHeader homeHref="/audits" />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Admin
          </h1>
          <p className="text-muted-foreground mt-1">
            Approve who gets an account, and what they can do once they have one.
          </p>
        </div>

        <div className="flex gap-2 mb-6 border-b">
          {(['applications', 'accounts'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'applications' ? `Applications${pending.length ? ` (${pending.length})` : ''}` : 'Accounts'}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        {notice && (
          <div className="p-3 mb-4 rounded-md bg-green-50 text-green-700 text-sm">{notice}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tab === 'applications' ? (
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Pending
              </h2>
              {pending.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    No applications waiting.
                  </CardContent>
                </Card>
              ) : (
                pending.map(req => (
                  <Card key={req.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">{req.email}</span>
                            {req.name && (
                              <span className="text-sm text-muted-foreground truncate">
                                · {req.name}
                              </span>
                            )}
                          </div>
                          {req.reason && (
                            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                              {req.reason}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Applied {formatDate(req.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => review(req.id, 'approve')}
                            disabled={busyId === req.id}
                          >
                            {busyId === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => review(req.id, 'reject')}
                            disabled={busyId === req.id}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>

            {reviewed.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Reviewed
                </h2>
                <Card>
                  <CardContent className="py-2 divide-y">
                    {reviewed.map(req => (
                      <div key={req.id} className="flex items-center justify-between py-3 gap-4">
                        <span className="text-sm truncate">{req.email}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                            req.status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-2 divide-y">
              {accounts.map(account => (
                <div key={account.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{account.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {formatDate(account.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[account.role]}`}
                    >
                      {ROLE_LABELS[account.role]}
                    </span>
                    <select
                      value={account.role}
                      onChange={e => changeRole(account.id, e.target.value as AppRole)}
                      disabled={busyId === account.id}
                      className="text-sm border rounded-md px-2 py-1 bg-background disabled:opacity-50"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
