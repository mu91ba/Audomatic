# Audit Tool Automation SaaS

## Architecture Overview

**Flow**: Form submission → n8n webhook → Supabase Edge Function (Puppeteer crawler) → Save to Supabase → Real-time updates to Next.js frontend → Interactive React Flow canvas

**Tech Stack**:

- Frontend: Next.js 14 (App Router) + React Flow + shadcn/ui + Tailwind
- Backend: Supabase (PostgreSQL + Edge Functions + Realtime)
- Orchestration: n8n (self-hosted on Hostinger VPS)
- Deployment: Vercel

## Implementation Phases

### Phase 1: Project Setup & Database

- Initialize Next.js 14 project in `/Users/mu91ba/Downloads/audit tool/audit tool v2/Audomatic`
- Install dependencies (React Flow, shadcn/ui, Supabase client, etc.)
- Set up Supabase schema:
- `audits` table (id, url, status, created_at, completed_at)
- `pages` table (id, audit_id, url, title, screenshot_url, level, parent_url)
- `design_tokens` table (id, audit_id, colors JSON, typography JSON)
- Configure Supabase client and environment variables

### Phase 2: Crawler Migration to Edge Function

- Adapt your existing `audit-crawler-enhanced.js` to Supabase Edge Function
- Handle Puppeteer in Deno environment (Edge Functions use Deno)
- Implement sitemap XML fetching and parsing (replacing your manual step)
- Store screenshots in Supabase Storage
- Save extracted data to database with real-time updates

### Phase 3: n8n Workflow Setup

- Create n8n workflow on your Hostinger VPS:
- Webhook trigger (receives URL submission from frontend)
- HTTP Request node to trigger Supabase Edge Function
- Optional: Email notification on completion
- Test webhook endpoint
- Document webhook URL for frontend integration

### Phase 4: Frontend - Audit Submission

- Create landing page with URL submission form
- Implement form validation (URL format check)
- POST to n8n webhook endpoint
- Show audit creation confirmation and redirect to audit view
- Add loading states and error handling

### Phase 5: Frontend - Interactive Canvas

- Set up React Flow canvas page
- Create custom node component to display page screenshot thumbnails
- Implement zoom, pan, drag functionality (built into React Flow)
- Build visual sitemap from database hierarchy data
- Position nodes based on page level
- Draw edges from parent to child pages
- Add mini-map and controls

### Phase 6: Frontend - Design Token Display

- Create sidebar component for audit list
- Build color palette panel showing extracted colors
- Build typography panel showing font families, weights, sizes
- Highlight inconsistencies (flagged sizes/colors from crawler data)
- Make panels collapsible

### Phase 7: Canvas Enhancements

- Implement sticky notes feature (create, edit, delete, position)
- Add screenshot preview modal (click node to enlarge)
- Implement canvas state persistence to database
- Add export functionality (PNG/PDF of canvas)

### Phase 8: Polish & Testing

- Add real-time progress updates during crawling
- Implement proper error states throughout app
- Add audit history/list view
- Mobile-responsive adjustments
- Test full workflow end-to-end
- Document setup and usage

## Key Files to Create

**Frontend**:

- `app/page.tsx` - Landing page with form
- `app/audit/[id]/page.tsx` - Canvas view
- `components/audit-canvas.tsx` - React Flow canvas
- `components/design-token-panel.tsx` - Token display
- `components/sticky-note.tsx` - Note component
- `lib/supabase.ts` - Supabase client

**Backend**:

- `supabase/functions/crawl-website/index.ts` - Edge Function with crawler logic
- `supabase/migrations/001_initial_schema.sql` - Database schema

**Integration**:

- n8n workflow JSON (to import into your n8n instance)

## Notes

- Starting simple: No auth initially (add later in Phase 9)
- Real-time updates via Supabase Realtime subscriptions
- Screenshots stored in Supabase Storage (not filesystem)
- Your existing crawler logic preserved, just adapted to serverless