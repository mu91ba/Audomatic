import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth-server'
import { canCreateAudits } from '@/lib/role'

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    // Validate URL
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    const auth = await authenticate(request)
    if (!auth.ok) return auth.response
    const { user, role, supabase } = auth.caller

    // Only approved accounts may crawl. This check is the friendly error
    // message; the actual enforcement is the audits INSERT policy in migration
    // 019, since the browser holds a Supabase token and could insert directly.
    if (!canCreateAudits(role)) {
      return NextResponse.json(
        { error: 'Your account does not have permission to run audits.' },
        { status: 403 }
      )
    }

    // Rate limiting: max 5 audits per user per hour
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('audits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart)

    if (count !== null && count >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} audits per hour.` },
        { status: 429 }
      )
    }

    // Create audit record
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .insert({ url, status: 'pending', user_id: user.id })
      .select()
      .single()

    if (auditError) {
      console.error('Error creating audit:', auditError)
      return NextResponse.json({ error: 'Failed to create audit' }, { status: 500 })
    }

    // Trigger crawler directly
    const crawlerUrl = process.env.CRAWLER_URL
    const crawlerSecret = process.env.CRAWLER_API_SECRET
    if (!crawlerUrl || !crawlerSecret) {
      console.error('CRAWLER_URL or CRAWLER_API_SECRET not configured')
      await supabase
        .from('audits')
        .update({ status: 'failed', error_message: 'Crawler not configured' })
        .eq('id', audit.id)
      return NextResponse.json({ error: 'Crawler not configured' }, { status: 500 })
    }

    try {
      const crawlerResponse = await fetch(`${crawlerUrl}/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': crawlerSecret,
        },
        body: JSON.stringify({ auditId: audit.id, url }),
      })
      if (!crawlerResponse.ok) {
        throw new Error(`Crawler returned ${crawlerResponse.status}`)
      }
    } catch (crawlerError) {
      console.error('Error triggering crawler:', crawlerError)
      await supabase
        .from('audits')
        .update({ status: 'failed', error_message: 'Failed to trigger crawler' })
        .eq('id', audit.id)
    }

    return NextResponse.json({ success: true, auditId: audit.id, url: audit.url })
  } catch (error) {
    console.error('Error in start-audit API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
