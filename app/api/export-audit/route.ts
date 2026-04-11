import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const N8N_EXPORT_WEBHOOK_URL = process.env.N8N_EXPORT_WEBHOOK_URL || ''
const N8N_EXPORT_WEBHOOK_SECRET = process.env.N8N_EXPORT_WEBHOOK_SECRET || ''

export async function POST(request: NextRequest) {
  try {
    const { auditId } = await request.json()

    if (!auditId) {
      return NextResponse.json({ error: 'auditId is required' }, { status: 400 })
    }

    // Require authentication
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

    // Verify audit exists, belongs to this user, and is completed
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .select('id, url, status, user_id, total_pages, processed_pages')
      .eq('id', auditId)
      .single()

    if (auditError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
    }
    if (audit.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Match the same "effectively complete" logic used on the frontend
    const isComplete =
      audit.status === 'completed' ||
      (audit.status === 'processing' &&
        audit.total_pages > 0 &&
        audit.processed_pages === audit.total_pages)

    if (!isComplete) {
      return NextResponse.json({ error: 'Audit is not completed yet' }, { status: 400 })
    }

    if (!N8N_EXPORT_WEBHOOK_URL) {
      return NextResponse.json({ error: 'Export not configured' }, { status: 500 })
    }

    // Call n8n export webhook — synchronous, waits for sheet URL
    const n8nResponse = await fetch(N8N_EXPORT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Export-Secret': N8N_EXPORT_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ auditId, auditUrl: audit.url }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!n8nResponse.ok) {
      const text = await n8nResponse.text()
      console.error('n8n export error:', text)
      return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }

    const result = await n8nResponse.json()
    if (!result.spreadsheetUrl) {
      return NextResponse.json({ error: 'No spreadsheet URL returned' }, { status: 500 })
    }

    return NextResponse.json({ url: result.spreadsheetUrl })
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Export timed out — try again' }, { status: 504 })
    }
    console.error('Error in export-audit API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
