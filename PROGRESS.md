# Progress Document — Sightmap (Audomatic)

> Purpose: a single running log so any new agent/session can get up to speed
> without re-reading every project file. **Add a dated entry for each work
> session. Newest first.** See README.md / CONTEXT.md for architecture basics
> (note: those files are older and partially stale — this file wins on
> conflicts).

---

## Session 2026-09-13 (latest) — Vercel retired; app runs on Cloudflare Workers

Follows the entry below. **App now lives at https://qanvos.com**, served by a
Cloudflare Worker. Vercel is no longer used. Five commits, none pushed.

### Why the move happened now
The R2 delete fix could not reach production on Vercel: Vercel builds from git
and the fix was uncommitted, so every deleted audit kept orphaning its
screenshot. Wrangler deploys from local files, so migrating shipped the fix.

### The stack
| Piece | Where |
|---|---|
| App | Cloudflare Worker `sightmap` → **qanvos.com** |
| Screenshots | R2 bucket `sightmap-screenshots` → **img.qanvos.com** |
| Crawler | VPS, behind a Cloudflare Tunnel → **crawler.qanvos.com** |
| DB + auth | Supabase `plyruluupcoikrobyzsy` (org `qanvos`) |
| Sheets export | n8n on the VPS (unchanged, still broken — see below) |

### Version pinning that matters
`@opennextjs/cloudflare` is pinned to **1.15.1** — the last line supporting
Next 14; 1.16.0 requires Next 15. That pins `next` to **14.2.35** (a patch bump
from 14.2.18). Upgrading the adapter therefore forces a Next 15 + React 19
upgrade, which would also drag `reactflow@11` → `@xyflow/react@12` and touch
the canvas. Don't bump it casually.

Build needs **Node 20** (`/opt/homebrew/opt/node@20/bin/node`); wrangler needs
**Node ≥22**. Local default is 26, so: build with 20, deploy with the default.

### Two Workers constraints that bit
1. **Workers will not fetch a raw IP over plain HTTP** — `http://77.37.67.72:3001`
   returned **403 from Cloudflare's edge** before leaving. Not a port issue:
   8080 failed the same way, while an HTTPS *hostname* returned a genuine origin
   response. Vercel had no such restriction, which is why this only appeared
   after the move. Fixed with a Cloudflare Tunnel.
2. **`@aws-sdk/client-s3` throws at request time on Workers.** Deleting an audit
   returned `"screenshots could not be removed"` and orphaned the object — the
   exact leak the route exists to prevent. Replaced with the native R2 binding
   (`env.SCREENSHOTS`), which also removed all four R2 secrets from the Worker
   and cut the bundle from 1294 → 1069 KiB gzipped (limit is 3 MB).

### Cloudflare Tunnel
`cloudflared` (systemd, enabled) on the VPS, tunnel `sightmap-crawler`
(`80c41747-0131-4ebc-bbf8-c25b772b687d`), config at `/etc/cloudflared/config.yml`,
routing crawler.qanvos.com → `http://localhost:3001`. The crawler now binds to
**127.0.0.1** only — it was previously exposed on the public IP with just the
`x-api-secret` header in front of it.

### Verified on qanvos.com
Unauthenticated delete → 401. Empty `auditId` → 400. Real crawl → `completed`,
WebP served from img.qanvos.com, delete → `screenshotsDeleted: 1`, confirmed
against the bucket rather than the API response (the CDN keeps serving the image
for a while afterwards — `Cache-Control` is a year, so don't test purging by
fetching the URL).

### Worker secrets
Only five remain: `SUPABASE_SERVICE_ROLE_KEY`, `CRAWLER_URL`,
`CRAWLER_API_SECRET`, `N8N_EXPORT_WEBHOOK_URL`, `N8N_EXPORT_WEBHOOK_SECRET`.
`NEXT_PUBLIC_*` are compiled in at build time, so changing them needs a rebuild,
not just a secret update.

### Still open
- [ ] Supabase **Site URL** still `http://localhost:3000` → set to
      `https://qanvos.com`, and add `https://qanvos.com/**` to redirect URLs.
      Confirmation, invite and password-reset links are broken until then.
- [ ] **Vercel project not deleted.** It still builds from git `main` and still
      has env vars pointing at the live Supabase project.
- [ ] n8n `export-workflow.json` has the **old** Supabase URL + apikey hardcoded
      in its "Fetch Pages" node. The Worker's `N8N_EXPORT_WEBHOOK_URL` also
      points at `/webhook/audit-webhook` (the dead legacy workflow) rather than
      `/webhook/export-audit`. Sheets export is broken until both are fixed.
- [ ] `n8n/audomatic-workflow.json` is dead — safe to delete from n8n.
- [ ] Old Supabase project `cmdybpjqhndjlfieilfg` still exists holding 0.961 GB.
- [ ] `www.qanvos.com` does not resolve; only the apex is attached.
- [ ] Nothing pushed. `debug/shopify-crawl-fix` is 6 commits ahead of `main` and
      still deliberately unmerged.

---

## Session 2026-09-13 (later) — R2 rollout executed; migrated to a NEW Supabase project

Continues the entry below, which described the plan. This is what actually
happened. **Site is back up.** Working tree was uncommitted at session start;
this session ends with a commit (not pushed).

### The Supabase fork resolved as Path B — but not for the expected reason
`_tmp-storage-check.js` assumed listing would work and only deletes might be
blocked. In fact **every** endpoint behind the API gateway returned 402: REST,
storage list, and storage delete (tested with a nonexistent key, so nothing was
destroyed). Path A was unreachable. Direct Postgres on :5432 stayed reachable
over IPv6 the whole time — the restriction is gateway-only.

Also learned: **free-plan quota is per organisation, not per project**, so a new
project inside `mu91ba` would have inherited the exhausted 1 GB. Resolved by
creating a **new org `qanvos`** with project **`plyruluupcoikrobyzsy`**.

### Schema was rebuilt, not migrated
Old audits were abandoned by decision, so nothing was dumped. Applied
migrations 001-015, plus two new ones:

- **`016_reconcile_live_schema.sql`** — the repo migrations never created
  `audits.updated_at`, `audits.title`, `audits.audit_data` or
  `pages.template_urls`, yet production had all four and `crawler.js` writes
  `template_urls` on every page insert. Production had been built by hand in
  the dashboard and drifted.
- **`017_fix_audits_select_policy.sql`** — the only SELECT policy on `audits`
  was `user_can_access_audit(id)`, which re-queries `audits`. During
  `INSERT ... RETURNING` (what `start-audit` does via `.select()`) the new row
  isn't visible to that inner query, so it returned false and Postgres reported
  *"new row violates row-level security policy"* — a read failure that reads
  like a write failure. A plain INSERT succeeded, which is what isolated it.
  Fixed by adding a direct-ownership SELECT policy alongside the shared path.

The two Supabase-Storage statements at the tail of `001` were **deliberately
omitted** — that bucket is what exhausted the old quota.

### Crawler
Deployed `crawler.js`, `server.js`, `storage.js`, `package.json`; ran
`npm install` for `@aws-sdk/client-s3`. Backup at
`/root/crawler-service/backups/2026-09-13/`.

**`server.js` had a latent bug**: `require('dotenv').config()` sat on line 10,
*after* `require('./crawler')`. `crawler.js` and `sitemap-parser.js` read
`MAX_PAGES`, `CRAWL_DELAY_MS`, `SCREENSHOT_SCALE` and `MAX_SITEMAP_URLS` at
module load, so those silently ignored `.env`. The VPS copy had an uncommitted
hotfix with dotenv on line 1; the repo copy did not. Now fixed in the repo.

### Verified end to end
Crawl of example.com: WebP **1080x675** (confirms `SCREENSHOT_SCALE=0.75`),
6 KB, stored at `img.qanvos.com/<auditId>/<file>.webp`, design tokens
extracted, status `completed`. Deleting the audit cascaded all DB children.

Also verified in isolation beforehand: R2 round trip, the WebP 16383px trap
(forcing WebP at 1080x18810 returns **0 bytes**; the JPEG fallback produced a
valid 128 KB file), and `deleteAuditScreenshots` emptying only its own prefix
while leaving an unrelated audit untouched.

### OPEN — the screenshot leak is NOT yet fixed in production
`app/api/delete-audit/route.ts`, `lib/r2.ts` and the `app/audits/page.tsx`
change exist only in the working tree. **Vercel builds from git**, and `main`
has neither file, so the deployed app still deletes the audit row directly from
the client and orphans the R2 object. Confirmed by observation: after deleting
the test audit, all DB rows were gone but
`a51f436f-.../example.com__182ccedb.webp` remained in the bucket.
**Fixing this requires getting these commits onto whatever branch Vercel
builds.** Not done — pushing needs the owner's approval, and
`debug/shopify-crawl-fix` is deliberately unmerged.

### Other open items
- [ ] Supabase **Site URL** is still `http://localhost:3000` — confirmation,
      invite and password-reset links all bounce to localhost.
- [ ] Vercel `N8N_EXPORT_WEBHOOK_URL` points at `/webhook/audit-webhook`, the
      **dead legacy** workflow. The export lives at `/webhook/export-audit`.
- [ ] `n8n/export-workflow.json` has the **old** Supabase URL and apikey
      hardcoded in its "Fetch Pages" node — Sheets export is broken until
      updated in the n8n UI.
- [ ] `n8n/audomatic-workflow.json` is dead — `start-audit` calls the crawler
      directly. Safe to delete from n8n.
- [ ] Old Supabase project `cmdybpjqhndjlfieilfg` still exists and still holds
      the 0.961 GB. Delete once everything is settled. Its service_role key was
      pasted into a chat transcript, so deleting the project retires it.
- [ ] Vercel stores the service-role key and R2 secret as **Config**, not
      Secret (readable in the dashboard). Cosmetic for a solo project.
- [ ] `next.config.js` `remotePatterns` still lists only `**.supabase.co`.
      Harmless today (plain `<img>`), needed if `next/image` is ever used.
- [ ] Considering migrating hosting from Vercel to Cloudflare Workers via
      `@opennextjs/cloudflare`. App is well suited (no middleware, no
      `next/image`, no ISR, 4 simple API routes, `@react-pdf/renderer` and
      `resend` are unused deps). Watch bundle size and Workers CPU limits.

### Local tooling notes
Node 26 breaks puppeteer 21's `yargs` dependency (ESM/CJS). Use
`/opt/homebrew/opt/node@20/bin/node` locally. `psql`/`pg_dump` 18.6 at
`/opt/homebrew/opt/libpq/bin/` (keg-only, not on PATH). No Docker on this Mac,
so the Supabase CLI's `db dump` is unavailable — use `psql` directly.

---

## Session 2026-09-13 — Screenshots moved off Supabase Storage to Cloudflare R2

**Branch:** working off current HEAD, **not committed/pushed** (standing rule).

### Problem
Supabase org `mu91ba` hit **0.961 / 1 GB storage (96%)** and every service began
returning 402 (`exceed_storage_size_quota`). Login, crawler DB writes, the lot.
Database was only 32 MB and egress 2% — storage alone was the problem. The
Storage UI also refuses to load its bucket list while restricted, so the files
could not be deleted through the dashboard (known Supabase catch-22).

### Root causes
1. **Uncompressed PNGs.** `crawler.js` captured `fullPage` `type: 'png'` at
   deviceScaleFactor 1 — ~2.4 MB per page, ~430 pages per GB. `MAX_PAGES`
   defaults to 500, so one large audit could fill the entire quota.
2. **Screenshots were never deleted.** `app/audits/page.tsx` deleted the audit
   row only; storage objects orphaned permanently. Every audit ever deleted was
   still occupying the bucket.

### Changes

**`crawler-service/storage.js` (new)**
- R2 upload via `@aws-sdk/client-s3`, returns the public URL.
- `assertStorageConfig()` — fails a crawl fast on incomplete `.env` instead of
  dying mid-upload or crash-looping pm2.
- `pickScreenshotFormat()` — WebP q70 normally; **JPEG q82 above 16383px**.
  WebP cannot encode a side longer than 16383px and Chrome returns a **0-byte
  buffer with no error** when you try, so tall pages would have silently written
  empty files. Measured and confirmed.

**`crawler-service/crawler.js`**
- Screenshots go to R2, not `supabase.storage`. Supabase now holds DB + auth only.
- `SCREENSHOT_SCALE` env (default **0.75**). Layout still computes at 1440 CSS px;
  only raster resolution drops, to 1080px. The canvas card renders at 280px
  (`w-[280px]`) and the detail modal caps at 1024px (`max-w-5xl`), so 1080px is
  still wider than anything the UI displays — no visible quality loss.
- Format limits are checked against **raster** dimensions, not CSS dimensions.
- `generateFilename(url, ext)` now takes an extension.
- Object key shape unchanged: `${auditId}/${filename}` — required for prefix deletes.

**`app/api/delete-audit/route.ts` (new) + `lib/r2.ts` (new)**
- Deletes the audit row **first**, using the caller's own token so RLS decides
  permission, then purges R2 under that audit's prefix. Doing storage first would
  let a blocked delete still destroy the images of an audit that survives.
- Never uses the service key — that would bypass RLS entirely.
- `auditId` must match a uuid regex before it is used as a key prefix. An empty
  or traversal-ish value would otherwise match and delete the whole bucket.
- Storage failure returns success with a `warning`; the audit really is gone.

**`app/audits/page.tsx`** — `deleteAudit()` calls the route instead of deleting
directly. Existing permission-denied message preserved.

**Frontend needed no other changes** — `screenshot_url` is a TEXT column rendered
as a plain `<img src>`, no `next/image`, no storage SDK on the client.

### Measured results (1440x11.7k page, headless Chromium)
| | size | vs current |
|---|---|---|
| PNG @1.0 (old) | 2464 KB | — |
| WebP q70 @1.0 | 827 KB | 3.0x |
| **WebP q70 @0.75 (new)** | **540 KB** | **4.6x** |
| WebP q70 @0.5 | 239 KB | 10.3x |

Quality is a weak lever (q50 only buys ~15% over q70); pixel count is the strong
one. ~430 screenshots per GB became ~1950. R2's free tier is 10 GB.

### New env vars
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` —
in **both** `crawler-service/.env` (VPS) and Vercel. Plus `R2_PUBLIC_BASE_URL`
(crawler only), `https://img.qanvos.com`. No `NEXT_PUBLIC_` prefix — these must
not reach the browser. Optional: `SCREENSHOT_SCALE`.

### Open items / next steps
- [ ] Cloudflare: create bucket, bind `img.qanvos.com` as custom domain, mint a
      scoped Object Read & Write token. Domain `qanvos.com` is already on
      Cloudflare (free plan, Full DNS).
- [ ] `npm install` in repo root **and** `crawler-service/`.
- [ ] **Do not deploy the crawler until R2 env is set** — `assertStorageConfig()`
      will fail every crawl by design.
- [ ] Run `_tmp-storage-check.js` (repo root, temporary — delete after) to learn
      whether service-key deletes work while restricted. Success = purge the
      bucket in place and skip the project migration entirely. 402 = fresh
      Supabase project instead.
- [ ] Existing 0.961 GB of screenshots are being abandoned by decision; old
      audits will show broken images until re-run.
- [ ] `next.config.js` `remotePatterns` still lists only `**.supabase.co`.
      Harmless today (plain `<img>`), but needs `img.qanvos.com` if `next/image`
      is ever used for screenshots.
- [ ] Pre-existing, unrelated: `start-audit/route.ts` writes `error_message` on
      failure, a column that doesn't exist in the live DB — those updates fail
      silently. Same stale-schema issue noted on 2026-08-03.

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
