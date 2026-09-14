# Sightmap

Crawls a website, screenshots every page, extracts design tokens, and renders
the result as an interactive visual sitemap on a React Flow canvas.

**Live:** https://qanvos.com

> `PROGRESS.md` is the running session log — what changed, when, and why.
> This file is the current state. Where they disagree, check the newest
> PROGRESS.md entry.

---

## Architecture

```
Browser
   │
   ▼
Cloudflare Worker  ──────────►  Supabase          (Postgres + Auth + Realtime)
qanvos.com                          ▲
   │                                │
   │  POST /crawl                   │ writes pages, tokens, status
   ▼                                │
Cloudflare Tunnel                   │
crawler.qanvos.com                  │
   │                                │
   ▼                                │
Crawler (Node + Puppeteer) ─────────┘
127.0.0.1:3001 on the VPS
   │
   ▼
Cloudflare R2  ──►  img.qanvos.com   (screenshots)
```

| Component | Where | Notes |
|---|---|---|
| App | Cloudflare Worker `sightmap` → **qanvos.com** | Next.js 14 via `@opennextjs/cloudflare` |
| Database + auth | Supabase `plyruluupcoikrobyzsy`, org `qanvos` | free plan, RLS enforced |
| Screenshots | R2 bucket `sightmap-screenshots` → **img.qanvos.com** | WebP q70 @ 0.75 scale |
| Crawler | Hostinger VPS `root@77.37.67.72`, pm2 `audomatic-crawler` | `/root/crawler-service/`, loopback only |
| Crawler ingress | `cloudflared` systemd → **crawler.qanvos.com** | tunnel `sightmap-crawler` |
| Sheets export | n8n (docker, same VPS) | `https://n8n.srv1051800.hstgr.cloud` |

The app calls the crawler **directly**. n8n is used only for the
"Export to Google Sheets" button.

---

## How a crawl works

1. `POST /api/start-audit` inserts an `audits` row (RLS: owner only) and calls
   the crawler over the tunnel.
2. The crawler fetches sitemaps (all children, interleaved round-robin), falling
   back to link discovery.
3. Per page: load, dismiss popups, scroll to settle lazy content, dismiss popups
   again, screenshot, extract colours and fonts, upload to R2, insert a `pages`
   row.
4. The canvas updates live over Supabase Realtime.
5. Deleting an audit cascades its DB rows **and** purges its R2 prefix.

---

## Local development

```bash
npm install
npm run dev                     # http://localhost:3000
```

Needs `.env.local` (gitignored) — see **Environment** below.

The crawler runs on the VPS; there is normally no reason to run it locally. If
you must:

```bash
cd crawler-service && npm install
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  /opt/homebrew/opt/node@20/bin/node server.js
```

---

## Deploying

### App → Cloudflare Workers

Wrangler deploys from **local files, not git**, so commit first or you will not
be able to tell what is live.

```bash
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx opennextjs-cloudflare build
npx wrangler deploy
```

Two different Node versions are required: the build needs **Node 20**, wrangler
needs **Node ≥22**.

### Crawler → VPS

```bash
scp crawler-service/*.js root@77.37.67.72:/root/crawler-service/
ssh root@77.37.67.72 "pm2 restart audomatic-crawler"
```

Check nothing is mid-crawl first — a restart kills it. Back up to
`/root/crawler-service/backups/<date>/` before overwriting.

### Database

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0NN_name.sql
```

`psql` is keg-only at `/opt/homebrew/opt/libpq/bin/`. Migrations `001`–`018`
reproduce the live schema from scratch.

---

## Environment

**Build-time** (`.env.local`, compiled into the bundle — changing these needs a
rebuild, not just a redeploy):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
```

**Worker runtime** (`npx wrangler secret list`):

```
SUPABASE_SERVICE_ROLE_KEY     # invite route: auth.admin + RLS bypass
CRAWLER_URL                   # https://crawler.qanvos.com
CRAWLER_API_SECRET
N8N_EXPORT_WEBHOOK_URL        # .../webhook/export-audit
N8N_EXPORT_WEBHOOK_SECRET
```

R2 needs **no credentials** in the Worker — it uses the `SCREENSHOTS` binding
declared in `wrangler.jsonc`.

**Crawler** (`/root/crawler-service/.env`):

```
SUPABASE_URL, SUPABASE_SERVICE_KEY
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
API_SECRET, PORT, HOST
SCREENSHOT_SCALE (0.75), MAX_PAGES (500), CRAWL_DELAY_MS (10000)
```

---

## Gotchas

Each of these cost real debugging time. Read before changing the related area.

- **Never create a Supabase Storage bucket.** Screenshots live in R2. An
  unbounded `screenshots` bucket is what exhausted the old project's 1 GB quota
  and took the site down. Migration `001`'s bucket statements are deliberately
  not applied.
- **Delete audits through the app, never the Supabase table editor.** The R2
  purge lives in `/api/delete-audit`; deleting rows directly orphans the images
  with no way to trace them.
- **Workers cannot fetch a raw IP over plain HTTP** — Cloudflare's edge returns
  403 before the request leaves. That is why the crawler is behind a tunnel.
- **`@aws-sdk/client-s3` throws at request time inside a Worker.** Use the R2
  binding. The crawler still uses the SDK because it runs on a plain VPS.
- **WebP cannot encode a dimension above 16383px** and Chrome returns a
  **0-byte buffer** rather than an error. `pickScreenshotFormat` falls back to
  JPEG, comparing **raster** (not CSS) dimensions. Re-test a very tall page if
  you touch scale, quality or format.
- **Realtime is a Postgres publication, not schema.** Tables must be in
  `supabase_realtime` or subscriptions silently never fire (migration `018`).
- **RLS policies that re-query their own table break `INSERT … RETURNING`** —
  the new row is invisible to the inner query, and Postgres reports it as a
  write violation (migration `017`).
- **`@opennextjs/cloudflare` is pinned to 1.15.1**, the last version supporting
  Next 14. Upgrading forces Next 15 + React 19, which drags
  `reactflow@11` → `@xyflow/react@12` and touches the canvas.
- **dotenv must load before `require('./crawler')`** — `crawler.js` and
  `sitemap-parser.js` read their tuning constants at module load.
- **Puppeteer 21 breaks on Node 26** (yargs ESM/CJS). Use Node 20 locally.
- **Shopify rate-limits the VPS IP** (HTTP 429, decays over hours). Hence
  `CRAWL_DELAY_MS=10000`. Local crawls from a residential IP avoid it.

---

## Capacity

At ~116 KB per screenshot and ~6.4 KB per page row:

| | Limit | Headroom |
|---|---|---|
| R2 | 10 GB free | ~88,000 screenshots |
| Supabase DB | 500 MB free | ~76,000 page rows |
| Supabase egress | 5 GB/mo | screenshots bypass it entirely (served from R2) |

Deleting an audit reclaims both.

---

## Open items

**Known issues**
- [ ] Social-proof widgets ("X from Y purchased…") survive both popup passes —
      they match none of the selectors in `handlePopups`.
- [ ] `www.qanvos.com` is not attached to the Worker; only the apex is.
- [ ] `next.config.js` `remotePatterns` still lists only `**.supabase.co`.
      Harmless with plain `<img>`, needed if `next/image` is ever used.
- [ ] Vercel stored some secrets as Config rather than Secret; the Cloudflare
      equivalents should be reviewed if the project gains collaborators.

**Housekeeping**
- [ ] `debug/shopify-crawl-fix` is pushed but unmerged — 16 commits ahead of
      `main`. Review and merge when ready.
- [ ] Rotate the Supabase service-role key and R2 token if the setup transcript
      was shared.

**Product ideas** (unchanged from the original roadmap)
- [ ] Expose shape annotations in the toolbar (they exist, unexposed)
- [ ] Export canvas as PNG/PDF
- [ ] Compare audits over time
- [ ] Scheduled recurring audits
- [ ] Accessibility / performance / SEO checks
- [ ] Revisit `MAX_PAGES=500` now that storage is ~20x cheaper per audit
