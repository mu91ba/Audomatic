import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(request: NextRequest) {
  try {
    const { auditId, email } = await request.json()

    if (!auditId || !email) {
      return NextResponse.json({ error: 'auditId and email are required' }, { status: 400 })
    }

    // Authenticate caller
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
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
    if (email.toLowerCase() === user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 })
    }

    // Check for duplicate invite
    const { data: existingShare } = await supabase
      .from('audit_shares')
      .select('id')
      .eq('audit_id', auditId)
      .eq('shared_with_email', email.toLowerCase())
      .single()

    if (existingShare) {
      return NextResponse.json({ error: 'This user has already been invited' }, { status: 409 })
    }

    // Use service role client to look up user by email
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers()
    const invitee = existingUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    // Insert the share record
    const shareData: Record<string, unknown> = {
      audit_id: auditId,
      shared_with_email: email.toLowerCase(),
      role: 'commenter',
      invited_by: user.id,
      status: invitee ? 'accepted' : 'pending',
      shared_with_user_id: invitee?.id || null,
      accepted_at: invitee ? new Date().toISOString() : null,
    }

    const { data: share, error: shareError } = await supabase
      .from('audit_shares')
      .insert(shareData)
      .select()
      .single()

    if (shareError) {
      console.error('Error creating share:', shareError)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    // Send invite email
    if (!invitee) {
      // New user — use Supabase Auth invite
      const appUrl = request.headers.get('origin') || 'http://localhost:3000'
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl}/audit/${auditId}`,
      })
    } else {
      // Existing user — send notification via Resend if configured
      const resendApiKey = process.env.RESEND_API_KEY
      if (resendApiKey) {
        const appUrl = request.headers.get('origin') || 'http://localhost:3000'
        try {
          const { Resend } = await import('resend')
          const resend = new Resend(resendApiKey)
          await resend.emails.send({
            from: 'Audomatic <noreply@audomatic.com>',
            to: email,
            subject: `You've been invited to view an audit on Audomatic`,
            html: `
              <h2>You've been invited to collaborate!</h2>
              <p>${user.email} has shared a website audit with you on Audomatic.</p>
              <p><strong>Website:</strong> ${audit.url}</p>
              <p><a href="${appUrl}/audit/${auditId}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">View Audit</a></p>
            `,
          })
        } catch (emailErr) {
          console.error('Error sending notification email:', emailErr)
          // Non-fatal — the share was still created
        }
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

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { error } = await supabase
      .from('audit_shares')
      .delete()
      .eq('id', shareId)

    if (error) {
      console.error('Error deleting share:', error)
      return NextResponse.json({ error: 'Failed to remove invite' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in invite DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
