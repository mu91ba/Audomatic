-- Migration 006: Security hardening
--
-- 1. Ensures RLS is enabled on all tables (in case it was ever disabled)
-- 2. Tightens the audits INSERT policy: new audits MUST be owned by an
--    authenticated user. Removes the old NULL escape hatch on writes.
-- 3. Keeps SELECT/UPDATE compatible with legacy rows where user_id IS NULL.

-- Ensure RLS is active on every table
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Drop the old INSERT policy that allowed null user_id inserts
DROP POLICY IF EXISTS "Users can create own audits" ON audits;

-- New INSERT policy: authenticated users only, user_id must match their uid
CREATE POLICY "Users can create own audits" ON audits
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  );

-- Ensure the service role can bypass RLS for crawler writes
-- (Supabase service role already bypasses RLS by default — this is a reminder comment)
-- The crawler uses SUPABASE_SERVICE_KEY which bypasses all RLS policies.
-- Never expose the service key to the frontend.
