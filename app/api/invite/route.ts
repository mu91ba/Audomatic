import { NextRequest, NextResponse } from 'next/server'
import { authenticate, serviceClient } from '@/lib/auth-server'
import { canCreateAudits } from '@/lib/role'

/**
 * Share an audit with someone, read-only.
 *
 * An invited account is created as a `viewer` by the auth.users trigger in
 * migration 019 — it can read the audits shared with it and nothing else. It
 * cannot crawl, and it cannot reshare: the ownership check below is server-side,
 * so hiding the Share button is presentation, not the control.
 */
export async function POST(request: NextRequest) {
  try {
    const { auditId, email } = await request.json()

    if (!auditId || !email) {
      return NextResponse.json({ error: 'auditId and email are required' }, { status: 400 })
    }

    const normalisedEmail = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const auth = await authenticate(request)
    if (!auth.ok) return auth.response
    const { user, role, supabase } = auth.caller

    // Viewers own no audits, so the ownership check below would refuse them
    // anyway. Failing here gives them the accurate reason.
    if (!canCreateAudits(role)) {
      return NextResponse.json(
        { error: 'Your account does not have permission to share audits.' },
        { status: 403 }
      )
    }

    // Verify caller owns the audit
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .select('id, user_id, url')
      .eq('id', auditId)
      .single()

    if (auditError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
    }

    if (audit.user_id !== user.id) {
      return NextResponse.json({ error: 'Only the audit owner can invite collaborators' }, { status: 403 })
    }

    // Prevent self-invite
    if (normalisedEmail === user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 })
    }

    // Check for duplicate invite
    const { data: existingShare } = await supabase
      .from('audit_shares')
      .select('id')
      .eq('audit_id', auditId)
      .eq('shared_with_email', normalisedEmail)
      .maybeSingle()

    if (existingShare) {
      return NextResponse.json({ error: 'This user has already been invited' }, { status: 409 })
    }

    // Admin client for user lookup, the share row and the invite email
    const supabaseAdmin = serviceClient()

    // Check if invitee already has an account
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const invitee = existingUsers?.users?.find(
      u => u.email?.toLowerCase() === normalisedEmail
    )

    // Insert share record using admin client (bypasses RLS)
    const shareData = {
      audit_id: auditId,
      shared_with_email: normalisedEmail,
      role: 'commenter',
      invited_by: user.id,
      status: invitee ? 'accepted' : 'pending',
      shared_with_user_id: invitee?.id || null,
      accepted_at: invitee ? new Date().toISOString() : null,
    }

    const { data: share, error: shareError } = await supabaseAdmin
      .from('audit_shares')
      .insert(shareData)
      .select()
      .single()

    if (shareError) {
      console.error('Error creating share:', shareError)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    // Only send Supabase invite email for NEW users (not existing accounts).
    // The new account lands as a viewer via the auth.users trigger; nothing
    // here needs to set a role, and nothing here should change the role of an
    // existing account that happens to be a member.
    if (!invitee) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        request.headers.get('origin') ||
        'http://localhost:3000'
      try {
        await supabaseAdmin.auth.admin.inviteUserByEmail(normalisedEmail, {
          redirectTo: `${appUrl}/audit/${auditId}`,
        })
      } catch (emailErr) {
        console.error('Error sending invite email:', emailErr)
      }
    }

    return NextResponse.json({ success: true, share })
  } catch (error) {
    console.error('Error in invite API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove a share
export async function DELETE(request: NextRequest) {
  try {
    const { shareId } = await request.json()
    if (!shareId) {
      return NextResponse.json({ error: 'shareId is required' }, { status: 400 })
    }

    const auth = await authenticate(request)
    if (!auth.ok) return auth.response
    const { supabase } = auth.caller

    // Deleted under the caller's own token, so the "Owner can delete shares"
    // policy decides. .select() matters: without it a delete that RLS filtered
    // to zero rows returns no error, and the caller was told it succeeded.
    const { data, error } = await supabase
      .from('audit_shares')
      .delete()
      .eq('id', shareId)
      .select()

    if (error) {
      console.error('Error deleting share:', error)
      return NextResponse.json({ error: 'Failed to remove invite' }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Only the audit owner can remove this invite.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in invite DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
