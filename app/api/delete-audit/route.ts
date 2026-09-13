import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  deleteAuditScreenshots,
  isR2Configured,
  isValidAuditId,
} from '@/lib/r2'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Delete an audit and its screenshots.
 *
 * Previously the client deleted the audit row directly and the screenshot
 * files were left behind forever, which is what exhausted the old Supabase
 * storage quota. Deleting the files needs R2 credentials, which must stay
 * server-side, hence this route.
 *
 * Ordering is deliberate: the database row is deleted FIRST, under the user's
 * own token so row-level security decides whether they may delete it. Only
 * once Postgres confirms a row was actually removed do we destroy the images.
 * Purging R2 first would let a blocked delete still wipe the screenshots of an
 * audit that continues to exist.
 */
export async function POST(request: NextRequest) {
  try {
    const { auditId } = await request.json()

    if (!isValidAuditId(auditId)) {
      return NextResponse.json({ error: 'Invalid audit id' }, { status: 400 })
    }

    // Require authentication (same pattern as start-audit)
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Anon key + the caller's token, so RLS applies exactly as it did when the
    // client deleted directly. Never use a service key here — it would bypass
    // RLS and let any signed-in user delete any audit.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    // 1. Delete the row. RLS decides permission; zero rows means blocked.
    const { data, error } = await supabase
      .from('audits')
      .delete()
      .eq('id', auditId)
      .select()

    if (error) {
      console.error('Error deleting audit:', error)
      return NextResponse.json({ error: 'Failed to delete audit' }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Delete was blocked — you may not have permission to delete this audit.' },
        { status: 403 }
      )
    }

    // 2. The audit is gone, so now reclaim its storage. A failure here is
    // logged and surfaced as a warning rather than an error: the user's
    // delete did succeed, and leftover objects can be swept later.
    if (!isR2Configured()) {
      console.warn(
        `Audit ${auditId} deleted but R2 is not configured — screenshots were left in place.`
      )
      return NextResponse.json({
        success: true,
        screenshotsDeleted: 0,
        warning: 'Storage not configured; screenshots were not removed.',
      })
    }

    try {
      const screenshotsDeleted = await deleteAuditScreenshots(auditId)
      return NextResponse.json({ success: true, screenshotsDeleted })
    } catch (storageError: any) {
      console.error(`Audit ${auditId} deleted but screenshot cleanup failed:`, storageError)
      return NextResponse.json({
        success: true,
        screenshotsDeleted: 0,
        warning: 'Audit deleted, but its screenshots could not be removed.',
      })
    }
  } catch (error) {
    console.error('Error in delete-audit API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
