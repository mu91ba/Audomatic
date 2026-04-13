# Sightmap — Project Context & History

## What is Sightmap?

Sightmap is a micro-SaaS that automates the website audit process by:
1. Crawling websites and capturing full-page screenshots
2. Building interactive visual sitemaps (like FigJam/Miro)
3. Extracting design tokens (colors, typography)
4. Allowing annotations (sticky notes, text) on the canvas

## Project Journey

### Phase 1: Foundation (Completed)
- Set up Next.js 14 with App Router
- Integrated React Flow for canvas
- Created Supabase schema for audits, pages, design tokens
- Implemented shadcn/ui components

### Phase 2: Crawler Service (Completed)
- Built standalone Node.js/Express crawler
- Implemented Puppeteer for screenshots
- Added sitemap parsing and link discovery
- Created design token extraction logic

### Phase 3: n8n Integration (Completed)
- Created webhook workflow for orchestration
- Connected frontend → n8n → crawler pipeline

### Phase 4: Canvas Features (Completed)
- Hierarchical layout with Dagre algorithm
- Custom page nodes with screenshot previews
- Grouped nodes for similar template pages
- Real-time updates via Supabase Realtime

### Phase 5: Annotations (In Progress)
- Implemented sticky notes and text annotations
- Added FigJam-style toolbar with keyboard shortcuts
- Shape annotations (rectangle, circle) exist but not exposed in UI

## Current Architecture

```
User → Next.js Frontend → /api/start-audit
                              ↓
                         n8n Webhook
                              ↓
                      Crawler Service (VPS)
                              ↓
                   Supabase (DB + Storage)
                              ↓
                   Real-time → Frontend Canvas
```

## Key Technical Decisions

1. **React Flow over custom canvas**: Provides built-in zoom, pan, node dragging, minimap
2. **Dagre for layout**: Automatic hierarchical tree layout
3. **Supabase Realtime**: Live updates as pages are crawled
4. **Separate crawler service**: Runs on VPS with full browser capabilities
5. **n8n for orchestration**: Flexible workflow automation

## Known Issues

1. No user authentication (public access only)
2. Shape annotations exist but not exposed in UI toolbar

## Next Steps (Priorities)

1. **High**: Add user authentication (Supabase Auth)
2. **Medium**: Enable shape annotations in toolbar
3. **Medium**: Add canvas export (PNG/PDF)
4. **Low**: Comparison mode for audits over time
5. **Low**: AI-powered insights from design tokens

## File Structure Quick Reference

```
app/
├── page.tsx                    # Landing page with URL input
├── audit/[id]/page.tsx         # Canvas view for specific audit
├── api/start-audit/route.ts    # API to create audit & trigger n8n

components/
├── audit-canvas.tsx            # Main React Flow canvas
├── page-node.tsx               # Individual page card
├── grouped-page-node.tsx       # Grouped template pages
├── design-token-panel.tsx      # Colors/typography sidebar
├── annotation-toolbar.tsx      # FigJam-style tool selector
├── sticky-note-node.tsx        # Sticky note annotation
├── text-annotation-node.tsx    # Text label annotation
├── shape-annotation-node.tsx   # Rectangle/circle shapes

lib/
├── supabase.ts                 # Client + TypeScript types
├── layout.ts                   # Dagre layout algorithm
├── utils.ts                    # Helper functions

crawler-service/
├── server.js                   # Express server entry
├── crawler.js                  # Main crawling logic
├── sitemap-parser.js           # Sitemap XML parsing
├── page-utils.js               # Screenshot & token extraction

supabase/migrations/
├── 001_initial_schema.sql      # Base tables
├── 002_progress_and_hierarchy.sql  # Progress tracking
├── 003_annotations.sql         # Unified annotations table
```

## Environment Variables Required

### Frontend (.env.local)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_N8N_WEBHOOK_URL`

### Crawler Service (.env)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `PORT`
- `API_SECRET`

### n8n
- `CRAWLER_API_SECRET`

## Testing Checklist

- [ ] Can submit URL and see audit created
- [ ] Pages appear on canvas in real-time
- [ ] Screenshots display correctly
- [ ] Grouped pages show with expand/collapse
- [ ] Design tokens panel shows colors/typography
- [ ] Can add sticky notes and text annotations
- [ ] Annotations persist after refresh
- [ ] Keyboard shortcuts work (V, H, T, S)

---
Last Updated: December 2024




