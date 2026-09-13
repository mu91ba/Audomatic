-- Owners must be able to see their own audit rows without a recursive lookup.
--
-- The only SELECT policy on `audits` was user_can_access_audit(id), which
-- re-queries `audits` for that id. During INSERT ... RETURNING (what
-- app/api/start-audit does via .select()) the new row is not yet visible to
-- that inner query, so the function returns false, the row is judged
-- invisible, and Postgres reports "new row violates row-level security
-- policy". A plain INSERT with no RETURNING succeeds, which is what makes
-- this look like a failing write rather than a failing read.
--
-- Permissive policies OR together, so this adds a direct ownership check
-- (evaluated against the row's own columns, no subquery) while leaving the
-- shared-collaborator path in user_can_access_audit untouched.

DROP POLICY IF EXISTS "Users can view own audits" ON audits;
CREATE POLICY "Users can view own audits" ON audits
  FOR SELECT USING (user_id = auth.uid());
