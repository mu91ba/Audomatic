import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin, serviceClient } from '@/lib/auth-server'

/**
 * The approval queue behind /admin. Admin-only in both directions.
 *
 * Approving does two things that must both succeed for the applicant to get in:
 * an auth account (via Supabase's invite email, so they choose their own
 * password) and a `member` row in app_users. The account alone is a viewer.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.ok) return auth.response

    const status = new URL(request.url).searchParams.get('status')

    // Service key: access_requests has RLS on and no policies, so no client
    // role can read it. Admin-ness was established above.
    let query = serviceClient()
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error loading access requests:', error)
      return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 })
    }

    return NextResponse.json({ requests: data ?? [] })
  } catch (error) {
    console.error('Error in admin access-requests GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.ok) return auth.response
    const { user: admin } = auth.caller

    const { requestId, action } = await request.json()
    if (!requestId || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { error: 'requestId and action ("approve" or "reject") are required' },
        { status: 400 }
      )
    }

    const supabase = serviceClient()

    const { data: accessRequest, error: loadError } = await supabase
      .from('access_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (loadError || !accessRequest) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }
    if (accessRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `This application was already ${accessRequest.status}.` },
        { status: 409 }
      )
    }

    if (action === 'reject') {
      const { error } = await supabase
        .from('access_requests')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
        .eq('id', requestId)

      if (error) {
        console.error('Error rejecting access request:', error)
        return NextResponse.json({ error: 'Failed to reject application' }, { status: 500 })
      }
      return NextResponse.json({ success: true, status: 'rejected' })
    }

    // --- approve ---
    const email = String(accessRequest.email).toLowerCase()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000'

    // The applicant may already exist — someone shared an audit with them
    // before they applied, which created a viewer account. Promote it rather
    // than trying to invite a second time.
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    let account = existingUsers?.users?.find(u => u.email?.toLowerCase() === email) ?? null
    let invited = false

    if (!account) {
      const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        { redirectTo: `${appUrl}/audits` }
      )
      if (inviteError || !invite?.user) {
        console.error('Error inviting approved applicant:', inviteError)
        return NextResponse.json(
          { error: 'Could not send the invite email. The application is still pending.' },
          { status: 502 }
        )
      }
      account = invite.user
      invited = true
    }

    // The auth.users trigger creates this row as a viewer; upsert covers the
    // case where the account predates migration 019 and has no row at all.
    const { error: roleError } = await supabase
      .from('app_users')
      .upsert(
        { id: account.id, email, role: 'member', updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )

    if (roleError) {
      console.error('Error granting member role:', roleError)
      return NextResponse.json(
        { error: 'Account created but the role could not be set. Fix it under Accounts.' },
        { status: 500 }
      )
    }

    const { error: markError } = await supabase
      .from('access_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
      .eq('id', requestId)

    if (markError) {
      // The applicant is in; only the bookkeeping failed. Say so rather than
      // reporting a failure that would invite a second approval.
      console.error('Approved but could not mark the request:', markError)
      return NextResponse.json({
        success: true,
        status: 'approved',
        invited,
        warning: 'Access granted, but the application still shows as pending.',
      })
    }

    return NextResponse.json({ success: true, status: 'approved', invited })
  } catch (error) {
    console.error('Error in admin access-requests POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
