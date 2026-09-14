# Sightmap Crawler Service

Node + Express + Puppeteer. Crawls a site, screenshots every page, extracts
design tokens, uploads to Cloudflare R2 and writes rows to Supabase.

Runs on the Hostinger VPS under pm2 as `audomatic-crawler`, bound to
**127.0.0.1:3001** and reached only through a Cloudflare Tunnel at
`crawler.qanvos.com`. It is not exposed on the public IP.

## Files

| File | Role |
|---|---|
| `server.js` | Express entry. Loads dotenv **first** (see below), auth middleware, `/crawl` and `/health`. |
| `crawler.js` | Crawl loop: queue, screenshots, format choice, R2 upload, DB writes. |
| `sitemap-parser.js` | Sitemap discovery, child-sitemap fetching, URL filtering. |
| `page-utils.js` | Page settling, popup dismissal, design-token extraction. |
| `storage.js` | R2 upload via the S3 API, plus format selection. |

## Endpoints

`POST /crawl` — `{ "auditId": "<uuid>", "url": "https://..." }`, header
`X-API-Secret`. Returns immediately; the crawl runs in the background and
reports progress by updating the `audits` row.

`GET /health` — `{ status, service, version }`.

Auth fails closed: if `API_SECRET` is unset, every request is rejected.

## Environment (`/root/crawler-service/.env`)

```
SUPABASE_URL=            SUPABASE_SERVICE_KEY=
R2_ACCOUNT_ID=           R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=    R2_BUCKET=
R2_PUBLIC_BASE_URL=https://img.qanvos.com
API_SECRET=              PORT=3001            HOST=127.0.0.1
SCREENSHOT_SCALE=0.75    MAX_PAGES=500        CRAWL_DELAY_MS=10000
```

`assertStorageConfig()` runs once at crawl start and fails the audit with a
clear message if any R2 variable is missing, rather than dying mid-upload.

## Deploy

```bash
scp crawler-service/*.js root@77.37.67.72:/root/crawler-service/
ssh root@77.37.67.72 "pm2 restart audomatic-crawler"
```

Confirm no crawl is running first — a restart kills it. Back up the current
files to `/root/crawler-service/backups/<date>/`. Rollback is restoring that
folder and restarting.

```bash
pm2 status && pm2 logs audomatic-crawler
curl https://crawler.qanvos.com/health
journalctl -u cloudflared -n 20      # tunnel
```

## Things that will bite you

- **dotenv must load before `require('./crawler')`.** `crawler.js` and
  `sitemap-parser.js` read `MAX_PAGES`, `CRAWL_DELAY_MS`, `SCREENSHOT_SCALE` and
  `MAX_SITEMAP_URLS` at module load, so a late `dotenv.config()` silently leaves
  them at their defaults.
- **WebP cannot encode a dimension above 16383px**, and Chrome returns a
  **0-byte buffer** instead of an error. `pickScreenshotFormat` switches to
  JPEG q82 above that, comparing **raster** (CSS × `SCREENSHOT_SCALE`), not CSS,
  dimensions. Re-test a very tall page after changing scale, quality or format.
- **Popups are swept twice** — once early, once after `ensurePageFullyLoaded`,
  because drawers and modals reopen on scroll. The second pass skips its waits
  (`handlePopups(page, { wait: false })`).
- **Shopify rate-limits this IP** (HTTP 429, decaying over hours), hence the 10s
  pacing and escalating retries.
- **Puppeteer 21 breaks on Node 26.** The VPS runs Node 20; keep it that way.
- Object keys are `${auditId}/${filename}` — the app's delete route relies on
  that prefix shape.
