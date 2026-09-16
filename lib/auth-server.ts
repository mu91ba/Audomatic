import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { parseRole, type AppRole } from './role'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Shared authentication for the API routes.
 *
 * Every route resolves the caller's role from `app_users` rather than from the
 * JWT's user_metadata, because the account holder can rewrite their own
 * metadata but has no write access to app_users (migration 019).
 *
 * The returned client carries the caller's own token, so row-level security
 * applies exactly as it would in the browser. Never hand a route the service
 * key unless it genuinely needs to act outside any one user's permissions —
 * see serviceClient() below.
 */
export type Caller = {
  user: User
  role: AppRole
  supabase: SupabaseClient
}

type AuthResult =
  | { ok: true; caller: Caller }
  | { ok: false; response: NextResponse }

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export async function authenticate(request: NextRequest): Promise<AuthResult> {
  const token = bearerToken(request)
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 }),
    }
  }

  // RLS lets an account read its own app_users row. A missing row or a failed
  // lookup falls through to 'viewer' in parseRole — deny by default.
  const { data: profile } = await supabase
    .from('app_users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return { ok: true, caller: { user, role: parseRole(profile?.role), supabase } }
}

/** authenticate(), then refuse anyone who is not an admin. */
export async function authenticateAdmin(request: NextRequest): Promise<AuthResult> {
  const result = await authenticate(request)
  if (!result.ok) return result
  if (result.caller.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    }
  }
  return result
}

/**
 * A client that bypasses RLS entirely. Only for work no single user is allowed
 * to do: writing app_users, reading the access_requests queue, sending invites.
 * Anything acting on behalf of a user must use the caller's own client instead.
 */
export function serviceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
