# Sightmap

**Read `README.md` for current architecture, deploy steps, env vars and
gotchas. Read `PROGRESS.md` for the session log** — what changed, when and why,
newest first. Add a dated entry there at the end of every work session.

Quick facts:
- Next.js 14 app on **Cloudflare Workers** (`@opennextjs/cloudflare`) at
  **qanvos.com** + Supabase (DB/auth/realtime) + **Cloudflare R2** for
  screenshots (img.qanvos.com) + Node/Puppeteer crawler on a Hostinger VPS
  behind a Cloudflare Tunnel (crawler.qanvos.com) + n8n for the Sheets export.
- Deploy app: `PATH="/opt/homebrew/opt/node@20/bin:$PATH" npx opennextjs-cloudflare build`
  then `npx wrangler deploy`. **Build needs Node 20, wrangler needs Node ≥22.**
  Wrangler deploys from local files, not git — commit before deploying.
- Deploy crawler: `scp crawler-service/*.js root@77.37.67.72:/root/crawler-service/`
  then `ssh root@77.37.67.72 "pm2 restart audomatic-crawler"`. Check nothing is
  mid-crawl first; back up to `backups/<date>/`.
- Migrations: `psql "$DB_URL" -f supabase/migrations/0NN_*.sql`
  (`psql` is keg-only at `/opt/homebrew/opt/libpq/bin/`). `001`–`018` rebuild
  the live schema; apply them in order.
- **Never `git push` without the user's explicit approval.** `debug/shopify-crawl-fix`
  is pushed but deliberately unmerged.
- **Never create a Supabase Storage bucket** — an unbounded one exhausted the
  free quota and took the site down. Screenshots belong in R2.
- **Never delete audit rows directly in Supabase** — the R2 purge lives in
  `/api/delete-audit`; direct deletes orphan the images.

README's "Gotchas" section documents the non-obvious failure modes (Workers
can't fetch raw IPs, the AWS SDK fails inside Workers, WebP's 16383px 0-byte
trap, Realtime being a publication, RLS breaking `INSERT … RETURNING`). Read it
before changing those areas.
