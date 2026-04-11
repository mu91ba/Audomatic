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

    // Create admin client for user lookup and invites
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Insert share record using admin client (bypasses RLS)
    const shareData = {
      audit_id: auditId,
      shared_with_email: email.toLowerCase(),
      role: 'commenter',
      invited_by: user.id,
      status: 'pending',
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

    // Send Supabase Auth invite email — works for both new and existing users
    const appUrl = request.headers.get('origin') || 'http://localhost:3000'
    try {
      await supabaseAdmin.auth.admin.inviteUserByEmail(email.toLowerCase(), {
        redirectTo: `${appUrl}/audit/${auditId}`,
      })
    } catch (emailErr) {
      console.error('Error sending invite email:', emailErr)
      // Non-fatal — share was still created, user can access when they log in
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
