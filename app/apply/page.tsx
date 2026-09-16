'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, User, Send, CheckCircle2 } from 'lucide-react'

/**
 * Apply for an account. Sightmap does not have open signups — an admin reviews
 * applications at /admin, and approval sends a Supabase invite email where the
 * applicant sets their own password. No password is collected here.
 */
export default function ApplyPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit your application')
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Could not submit your application')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AppHeader />
      <main className="flex flex-col items-center justify-center p-6 pt-20">
        <div className="w-full max-w-md space-y-8">
          {submitted ? (
            <Card className="w-full shadow-lg">
              <CardContent className="py-12 text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <div>
                  <h2 className="text-xl font-semibold">Application received</h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    We&apos;ll email you at <span className="font-medium">{email}</span> if
                    your application is approved. You&apos;ll set your password from that email.
                  </p>
                </div>
                <Link href="/" className="inline-block text-sm text-primary hover:underline">
                  Back to sign in
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="w-full shadow-lg">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Apply for access</CardTitle>
                <CardDescription>
                  Sightmap is invite-only. Tell us who you are and we&apos;ll be in touch.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={submitting}
                      className="pl-10"
                      required
                    />
                  </div>

                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={submitting}
                      className="pl-10"
                      maxLength={120}
                    />
                  </div>

                  <textarea
                    placeholder="What would you use Sightmap for? (optional)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={submitting}
                    maxLength={1000}
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  {error && (
                    <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit application
                      </>
                    )}
                  </Button>

                  <div className="text-center text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <Link href="/" className="text-primary hover:underline font-medium">
                      Sign in
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
