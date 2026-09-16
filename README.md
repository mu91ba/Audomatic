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

### How the tree is drawn

`lib/hierarchy.ts` derives the parent of every card from its **URL path**, not
from `parent_url`. Sitemaps carry no hierarchy, so the crawler records most
pages as discovered from the homepage; `reparentPagesByUrlPath` improves on
that but can only attach a page to an ancestor that was itself crawled.

Date permalinks have no such ancestor — `/2026`, `/2026/07` and `/2026/07/20`
are archive routes, not pages — so those pages fell back to the homepage. On
sportbc.com that put 58 of 62 pages in a single row.

Missing ancestors are therefore drawn as **folder nodes**: dashed, no
screenshot, clearly not a page that was visited. A run of date segments
collapses to the year, so a post sits at `/` → `/2026` → post rather than
gaining three ranks of near-empty year/month/day cards.

Because this is computed at render time, changing it re-draws existing audits
with no re-crawl.

---

## Accounts and access

There are no open signups. Every account has a role, held in the `app_users`
table:

| Role | Can |
|---|---|
| `admin` | approve applications at `/admin`, plus everything a member can |
| `member` | run audits, own them, share them read-only |
| `viewer` | read the audits shared with them. Nothing else. |

New accounts default to `viewer` — a trigger on `auth.users` creates the row —
so an account that appears without going through `/admin` can do nothing.

**Getting in:** apply at `/apply` → a row lands in `access_requests` → an admin
approves at `/admin` → Supabase emails an invite and the role becomes `member`.
No password is ever collected by the application form.

**Sharing** is read-only by design. A viewer sees the canvas, the pages and the
owner's annotations, and cannot annotate, move a node, export, reshare, or see
that any other audit exists.

The role must be read from `app_users` and never from the JWT — see Gotchas.

```bash
./supabase/tests/run.sh    # rebuild the schema locally and assert every rule above
```

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

`psql` is keg-only at `/opt/homebrew/opt/libpq/bin/`. Migrations `001`–`019`
reproduce the live schema from scratch; `./supabase/tests/run.sh` proves they
still do.

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

## Backups

Supabase's free plan has no point-in-time recovery, and the audit data and user
accounts exist nowhere else. `/root/sightmap-backup.sh` on the VPS runs nightly
at 03:30 UTC via cron:

- `pg_dump` of `public` (app tables) and `auth` (accounts) — other schemas are
  Supabase-managed and any new project recreates them
- gzipped to `/root/backups/db/`, newest 14 kept
- optionally copied to the **private** `sightmap-backups` R2 bucket

Config is `/root/.sightmap-backup.env` (chmod 600). Off-site upload is disabled
until `R2_BACKUP_ACCESS_KEY_ID` / `R2_BACKUP_SECRET_ACCESS_KEY` are filled in —
the screenshots token will not work, as it is scoped to that bucket. Without
them the script still writes a local dump and exits clean.

Backups must never go in `sightmap-screenshots`: that bucket is public via
img.qanvos.com, so a dump there would be publicly downloadable.

```bash
ssh root@77.37.67.72 "/root/sightmap-backup.sh"     # run now
ssh root@77.37.67.72 "tail /root/backups/backup.log"
```

---

## Gotchas

Each of these cost real debugging time. Read before changing the related area.

- **Collapse doubled slashes when normalising a URL.** A site that links to
  both `/about` and `//about` gets crawled and screenshotted twice — the
  strings differ, so dedupe misses — and `//x/y` never matches its parent `/x`,
  so the page lands at the top of the tree. sportbc.com did this on 9 of 62
  URLs, 6 of them straight duplicates.
- **Query only after the session resolves.** supabase-js restores and refreshes
  the session asynchronously, so a Supabase call fired from a `useEffect` on
  mount goes out with just the anon key and every RLS-protected table returns
  zero rows. With `.single()` that surfaces as "Cannot coerce the result to a
  single JSON object", which looks nothing like an auth problem. Gate on
  `loading` from `useAuth()`, as `/audits` does, and prefer `.maybeSingle()`
  wherever RLS filtering everything out is a legitimate outcome.
- **Dagre ranks by edges, not by `page.level`.** Setting a sensible `level` on
  a row changes nothing on the canvas; only an edge to a parent node moves a
  card down a rank. Dagre also returns each node's *centre*, and a rank's
  centre line is shared, so cards of different heights in one rank must be
  top-aligned by hand or short cards float in the middle of tall ones.
- **A role in `user_metadata` is not a permission.** `supabase.auth.updateUser
  ({ data: ... })` lets an account rewrite its own metadata — the account
  settings modal does exactly that to save a display name. The old
  `role: 'invitee'` check could therefore be switched off from the browser
  console. Roles live in `app_users`, which no client role may write
  (migration `019`).
- **An RLS `UPDATE` policy needs `WITH CHECK`, not just `USING`.** `USING`
  tests the row as it was; without `WITH CHECK` the *updated* row is never
  validated. Migration `011`'s share policy let a viewer repoint their own
  share row at any audit id they knew and read it. Where the columns must not
  move at all, drop the policy and do the write in a `SECURITY DEFINER`
  function instead — `accept_pending_shares()` in `019`.
- **API-route permission checks are messages, not controls.** The browser holds
  a Supabase token and can write to the database directly, so anything
  `/api/start-audit` refuses must also be refused by a policy. Every check in a
  route has a matching rule in `019`.
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
- [ ] Existing audits still contain the duplicate rows the doubled-slash bug
      created (6 on sportbc.com). The fix is in `normalizeUrl`, so a re-crawl
      clears them; nothing rewrites rows already stored.
- [ ] Social-proof widgets ("X from Y purchased…") survive both popup passes —
      they match none of the selectors in `handlePopups`.
- [ ] `www.qanvos.com` is not attached to the Worker; only the apex is.
- [ ] `next.config.js` `remotePatterns` still lists only `**.supabase.co`.
      Harmless with plain `<img>`, needed if `next/image` is ever used.
- [ ] Vercel stored some secrets as Config rather than Secret; the Cloudflare
      equivalents should be reviewed if the project gains collaborators.

**Housekeeping**
- [ ] **Turn off signups in Supabase** — Authentication → Sign In / Providers →
      Email → disable "Allow new users to sign up". Removing the form from the
      UI does not close `/auth/v1/signup`; migration `019` is the backstop that
      leaves any account created behind the app's back as a `viewer`.
- [x] `debug/shopify-crawl-fix` — merged. It and `main` are both at `902cc46`;
      the "16 commits ahead" note was stale.
- [ ] Rotate the Supabase service-role key and R2 token if the setup transcript
      was shared.
- [ ] Fill in `R2_BACKUP_*` in `/root/.sightmap-backup.env` to enable off-site
      backup copies (needs a new R2 token scoped to `sightmap-backups`).

**Product ideas** (unchanged from the original roadmap)
- [ ] Expose shape annotations in the toolbar (they exist, unexposed)
- [ ] Export canvas as PNG/PDF
- [ ] Compare audits over time
- [ ] Scheduled recurring audits
- [ ] Accessibility / performance / SEO checks
- [ ] Revisit `MAX_PAGES=500` now that storage is ~20x cheaper per audit
