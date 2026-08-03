# Progress Document — Sightmap (Audomatic)

> Purpose: a single running log so any new agent/session can get up to speed
> without re-reading every project file. **Add a dated entry for each work
> session. Newest first.** See README.md / CONTEXT.md for architecture basics
> (note: those files are older and partially stale — this file wins on
> conflicts).

---

## Session 2026-08-03 — Shopify crawl fixes, grouping overhaul, VPS deploy

**Branch:** `debug/shopify-crawl-fix` (8 commits, deployed to VPS, **not yet
merged to main / not pushed** — waiting for user approval).

### Problem that started it all
Audit of https://aidolhouse.com (Shopify store) produced only 4 pages, blank
"Untitled Page" screenshots, and a `/agents.md` markdown file shown as a page.

### Root causes found (in order of discovery)
1. **Child sitemaps never fetched** — `extractChildSitemapUrls()` only accepted
   URLs *ending* in `.xml`, but Shopify child sitemaps carry query strings
   (`sitemap_products_1.xml?from=...&to=...`) and `&amp;` entities were never
   decoded. Only `sitemap_blogs_1.xml` + `sitemap_agentic_discovery.xml` were
   ever seen — exactly matching the 4-page canvas.
2. **`/agents.md` crawled as a page** — no extension filter for `.md`.
3. **"Untitled Page" titles** — Shopify serves degraded HTML (no `<title>`) to
   headless/bot user agents.
4. **Audits stuck in "processing"** — crawler wrote `completed_at` /
   `error_message` columns that don't exist in the live DB (live `audits`
   columns: id, created_at, updated_at, title, url, status, audit_data,
   user_id, total_pages, processed_pages, canvas_layout). Repo migration 001
   is stale vs prod.
5. **Shopify rate-limiting (HTTP 429)** — the Hostinger VPS datacenter IP gets
   hard-throttled after bursts; penalty decays over hours. Storefront paths
   only — `/cart`, `/account`, `/policies/*` are exempt.
6. **Unicode URLs crashed screenshot upload** — Korean collection URLs
   (블랙핑크) produced storage keys Supabase rejects.

### Changes made (all in `crawler-service/`)

**sitemap-parser.js**
- Detect child sitemaps by URL *pathname* ending `.xml`; decode XML entities.
- Fetch ALL child sitemaps (cap raised 10 → 50), then interleave URLs
  round-robin so one giant section can't starve the rest.
- Sitemap URL cap removed (`MAX_URLS` default Infinity; `MAX_SITEMAP_URLS` env
  for testing) → template group counts are now **true totals**.
- Shared `isCrawlablePageUrl()` filter (blocks .md, .txt, images, etc.),
  exported and reused by crawler.js link extraction.

**crawler.js**
- Realistic Chrome UA + `Accept-Language` + `navigator.webdriver` masking →
  Shopify serves full HTML with real titles.
- Title fallback chain: `<title>` → `og:title` → `h1` → URL slug.
- Skip non-HTML responses and 4xx pages (no more screenshots of error pages).
- HTTP 429: retry up to 3× with escalating waits (60/120/180s, honors
  Retry-After); `DELAY_BETWEEN_PAGES` 2s → 10s (env `CRAWL_DELAY_MS`).
- `MAX_PAGES` env-overridable (default 500 — kept as safety valve).
- **Grouping overhaul**: `/pages/` (static content) only groups at 15+ URLs
  (vs 4+ for products/collections/posts), and well-known slugs (about,
  contact, shipping, returns, FAQ, privacy, terms — see
  `IMPORTANT_PAGE_SLUGS`) are **never** grouped.
- Screenshot filenames: strip non-ASCII + append 8-char md5 of URL.
- Removed `completed_at`/`error_message` writes (schema mismatch fix).
- URL normalization also strips utm_term/utm_content/country/locale/currency.

**Frontend (committed to main earlier today, already pushed)**
- `isOwner` no longer treats `user_id === null` audits as owned
  (`app/audit/[id]/page.tsx`, `app/audits/page.tsx`).
- New migration `supabase/migrations/015_scope_audits_to_owner.sql`.

### Verification
Final local crawl of aidolhouse.com: **19/19 pages, zero errors** — real
titles, full screenshots (checked visually), static pages individual, groups
showing true counts: 1,953 products / 225 collections / ~1,798 landing pages /
26 posts. Audit visible in the app under mamuneeba@gmail.com.

### Infrastructure / deploy notes
- **VPS**: Hostinger, root@77.37.67.72, crawler at `/root/crawler-service/`,
  pm2 process `audomatic-crawler`, port 3001 (`x-api-secret` auth). n8n runs
  in docker (`root-n8n-1`) behind https://n8n.srv1051800.hstgr.cloud.
- **Deploy** = `scp crawler-service/*.js root@77.37.67.72:/root/crawler-service/
  && ssh root@77.37.67.72 "pm2 restart audomatic-crawler"`.
- **SSH**: key auth from this Mac now works (`~/.ssh/id_ed25519`).
  ⚠️ During setup, Hostinger's two pre-existing RSA keys in
  `authorized_keys` were accidentally lost. Panel Terminal should be
  re-verified; recovery path = panel "Root password → Change".
  Pre-fix file backups live at `/root/crawler-service/backups/2026-08-03/`.
- **Local test runs**: need `PUPPETEER_EXECUTABLE_PATH="/Applications/Google
  Chrome.app/Contents/MacOS/Google Chrome"` (puppeteer's bundled Chrome 121
  crashes on this macOS). Local (residential IP) crawls avoid the 429s
  entirely.

### Export to Sheets (n8n) — investigated, NOT broken
2026-08-03 "failure" was exporting an audit that had just been deleted →
0 rows → Google Sheets API 400 at "Append Rows" node. Workflow + Google
credentials healthy (spreadsheet creation succeeded). Workflow name:
"Audomatic Export to Google Sheets" (n8n docker, event logs at
`/home/node/.n8n/n8nEventLog*.log`).

### Open items / next steps
- [ ] **Merge `debug/shopify-crawl-fix` → main and push** (user approval
      required — standing rule: never push without asking).
- [ ] User to verify Hostinger panel Terminal still opens (lost RSA keys).
- [ ] Consider n8n workflow guard: skip "Append Rows" when 0 rows.
- [ ] Rate-limit strategy for Shopify at scale: VPS datacenter IP gets
      penalized after repeated crawls — consider residential proxy if
      Shopify sites become a core use case.
- [ ] Repo migrations are stale vs live DB (001 lacks
      updated_at/title/audit_data/canvas_layout etc.) — worth dumping the
      real schema into a fresh migration for accuracy.
- [ ] Frontend polish idea: format big group counts ("1.9k pages").
- [ ] Consider excluding utility pages from crawl (/cart, /account, /search,
      /a/withdrawal, /apps/wishlist) or flagging them separately.

### Older roadmap (from CONTEXT.md, still relevant)
- Shape annotations exist but not exposed in UI toolbar.
- Canvas export PNG (PDF export was built Apr 2, needs testing).
- Audit comparison over time; AI-powered insights.
