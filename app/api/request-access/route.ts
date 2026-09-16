import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/auth-server'

/**
 * Public endpoint: apply for a Sightmap account.
 *
 * Signups are closed — an account only exists once an admin approves the
 * application at /admin, which triggers a Supabase invite email. No password
 * is collected here, so an application that is never approved leaves nothing
 * behind but a row.
 *
 * Writes with the service key rather than giving `anon` an INSERT policy on
 * access_requests: an anonymous INSERT policy is also an anonymous way to probe
 * the table, and the dedupe below would sit client-side where it means nothing.
 */

const MAX_REASON_LENGTH = 1000
const MAX_NAME_LENGTH = 120

/** Stops an unauthenticated endpoint from being used to fill the table. */
const MAX_PENDING_REQUESTS = 500

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const name = body?.name ? String(body.name).trim().slice(0, MAX_NAME_LENGTH) : null
    const reason = body?.reason ? String(body.reason).trim().slice(0, MAX_REASON_LENGTH) : null

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    const supabase = serviceClient()

    const { count: pendingCount } = await supabase
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (pendingCount !== null && pendingCount >= MAX_PENDING_REQUESTS) {
      console.warn('access_requests queue is full; rejecting new applications')
      return NextResponse.json(
        { error: 'Applications are temporarily closed. Please try again later.' },
        { status: 503 }
      )
    }

    const { error } = await supabase
      .from('access_requests')
      .insert({ email, name, reason, status: 'pending' })

    // 23505 is the partial unique index on (lower(email)) WHERE status='pending'.
    // A repeat application is reported as success: telling the applicant their
    // address is already queued reveals who has applied.
    if (error && error.code !== '23505') {
      console.error('Error creating access request:', error)
      return NextResponse.json({ error: 'Could not submit your application' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in request-access API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
