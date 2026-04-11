import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderReport } from '@/lib/pdf/audit-report'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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

    // Verify audit exists and belongs to user
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .select('*')
      .eq('id', auditId)
      .single()

    if (auditError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 })
    }
    if (audit.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isComplete =
      audit.status === 'completed' ||
      (audit.status === 'processing' &&
        audit.total_pages > 0 &&
        audit.processed_pages === audit.total_pages)

    if (!isComplete) {
      return NextResponse.json({ error: 'Audit is not completed yet' }, { status: 400 })
    }

    // Fetch all pages for this audit
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('*')
      .eq('audit_id', auditId)
      .order('level', { ascending: true })

    if (pagesError) {
      return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
    }

    // Generate PDF
    const buffer = await renderReport(audit, pages || [])

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="audit-report.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Error in export-pdf API:', error?.message, error?.stack)
    return NextResponse.json({ error: error?.message || 'PDF generation failed' }, { status: 500 })
  }
}
