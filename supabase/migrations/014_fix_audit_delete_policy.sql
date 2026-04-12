-- Migration 014: Fix DELETE policy on audits for legacy rows with user_id IS NULL
--
-- Migration 005 added `USING (auth.uid() = user_id)` for audits DELETE.
-- Audits created before auth was added have user_id = NULL, so that check
-- evaluates to NULL (not true) and Postgres blocks the delete silently —
-- the UI sees the row "disappear" optimistically but it comes back on reload.
-- SELECT and UPDATE already have the `OR user_id IS NULL` escape hatch;
-- this adds the same for DELETE so legacy rows can be cleaned up.

DROP POLICY IF EXISTS "Users can delete own audits" ON audits;
CREATE POLICY "Users can delete own audits" ON audits
  FOR DELETE USING (
    auth.uid() = user_id OR user_id IS NULL
  );
