import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin, serviceClient } from '@/lib/auth-server'
import { parseRole } from '@/lib/role'

/**
 * Accounts and their roles, for the Accounts tab of /admin.
 *
 * Migration 019 demotes every pre-existing account that owns no audits to
 * `viewer`, so this exists partly to put back anyone it demoted by mistake.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.ok) return auth.response

    const { data, error } = await serviceClient()
      .from('app_users')
      .select('id, email, role, created_at')
      .order('role', { ascending: true })
      .order('email', { ascending: true })
      .limit(500)

    if (error) {
      console.error('Error loading accounts:', error)
      return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 })
    }

    return NextResponse.json({ users: data ?? [] })
  } catch (error) {
    console.error('Error in admin users GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.ok) return auth.response
    const { user: admin } = auth.caller

    const body = await request.json()
    const userId = String(body?.userId ?? '')
    const role = parseRole(body?.role)

    if (!userId || body?.role !== role) {
      return NextResponse.json(
        { error: 'userId and a role of "admin", "member" or "viewer" are required' },
        { status: 400 }
      )
    }

    // Demoting yourself is how you end up locked out of the page that is the
    // only way back in.
    if (userId === admin.id && role !== 'admin') {
      return NextResponse.json(
        { error: 'You cannot remove your own admin access.' },
        { status: 400 }
      )
    }

    const supabase = serviceClient()

    // Belt and braces for the same lockout, via a second admin account.
    if (role !== 'admin') {
      const { count } = await supabase
        .from('app_users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')

      const { data: target } = await supabase
        .from('app_users')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      if (target?.role === 'admin' && count !== null && count <= 1) {
        return NextResponse.json(
          { error: 'This is the only admin account. Promote someone else first.' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await supabase
      .from('app_users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()

    if (error) {
      console.error('Error updating role:', error)
      return NextResponse.json({ error: 'Failed to update the role' }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, user: data[0] })
  } catch (error) {
    console.error('Error in admin users PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
