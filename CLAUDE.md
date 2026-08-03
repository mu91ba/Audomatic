# Sightmap (Audomatic)

**Start here: read `PROGRESS.md`** — it's the running session log with the
current state, recent changes, infrastructure/deploy details, and open items.
Add a dated entry there at the end of every work session (newest first).

Quick facts:
- Next.js 14 frontend (Vercel: audomatic.vercel.app) + Supabase (DB/storage/
  realtime) + Node/Puppeteer crawler on Hostinger VPS (root@77.37.67.72,
  `/root/crawler-service/`, pm2 `audomatic-crawler`) + n8n (docker, same VPS).
- Deploy crawler: `scp crawler-service/*.js root@77.37.67.72:/root/crawler-service/`
  then `ssh root@77.37.67.72 "pm2 restart audomatic-crawler"` (SSH key auth works).
- Never `git push` without the user's explicit approval.
- README.md / CONTEXT.md / PROJECT_STATUS.md are older and partially stale —
  PROGRESS.md wins on conflicts.
