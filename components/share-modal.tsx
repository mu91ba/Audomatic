'use client'

import { useState, useEffect } from 'react'
import { supabase, type AuditShare } from '@/lib/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, Loader2, UserPlus, Trash2, Clock, CheckCircle2 } from 'lucide-react'

interface ShareModalProps {
  auditId: string
  onClose: () => void
}

export function ShareModal({ auditId, onClose }: ShareModalProps) {
  const [email, setEmail] = useState('')
  const [shares, setShares] = useState<AuditShare[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadShares()
  }, [auditId])

  async function loadShares() {
    try {
      const { data, error } = await supabase
        .from('audit_shares')
        .select('*')
        .eq('audit_id', auditId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setShares(data || [])
    } catch (err) {
      console.error('Error loading shares:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setInviting(true)
    setError(null)
    setSuccess(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ auditId, email: email.trim() }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invite')

      setSuccess(`Invite sent to ${email}`)
      setEmail('')
      loadShares()
    } catch (err: any) {
      setError(err.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(shareId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch('/api/invite', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shareId }),
      })

      if (res.ok) {
        setShares(shares.filter(s => s.id !== shareId))
      }
    } catch (err) {
      console.error('Error removing share:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Share Audit</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Invite form */}
        <form onSubmit={handleInvite} className="px-6 py-4 border-b">
          <p className="text-sm text-muted-foreground mb-3">
            Invite someone to view this audit and add comments.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" disabled={inviting || !email.trim()}>
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          {success && <p className="text-sm text-green-600 mt-2">{success}</p>}
        </form>

        {/* Shares list */}
        <div className="px-6 py-4 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No one has been invited yet
            </p>
          ) : (
            <div className="space-y-3">
              {shares.map((share) => (
                <div key={share.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {share.status === 'accepted' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{share.shared_with_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {share.status === 'accepted' ? 'Accepted' : 'Pending'} - {share.role}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleRemove(share.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
