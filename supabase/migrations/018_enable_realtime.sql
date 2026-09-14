-- Publish the tables the app subscribes to over Supabase Realtime.
--
-- app/audit/[id]/page.tsx opens postgres_changes channels on `pages` and
-- `audits` (live crawl progress), and components/audit-canvas.tsx does the same
-- for `annotations`. Realtime only delivers rows for tables in the
-- supabase_realtime publication, and a freshly created project starts with that
-- publication empty — so progress silently required a manual page refresh.
--
-- This is dashboard state in Supabase ("Realtime" toggle per table), which is
-- why rebuilding the schema from migrations did not carry it over. Keeping it
-- as a migration means the next rebuild does.
--
-- design_tokens and audit_shares are deliberately left out; nothing subscribes
-- to them, and publishing a table has a small write cost.

ALTER PUBLICATION supabase_realtime ADD TABLE audits;
ALTER PUBLICATION supabase_realtime ADD TABLE pages;
ALTER PUBLICATION supabase_realtime ADD TABLE annotations;
