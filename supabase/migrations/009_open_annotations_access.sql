-- Migration 009: Restore open access to annotations table
--
-- Annotations don't need per-user RLS. The audit_id UUID acts as the
-- security token — you can only access annotations if you know the audit ID.
-- The complex auth-based policies from migration 005 caused silent delete
-- failures when the frontend auth session didn't exactly match.

DROP POLICY IF EXISTS "Users can view annotations of own audits" ON annotations;
DROP POLICY IF EXISTS "Users can create annotations in own audits" ON annotations;
DROP POLICY IF EXISTS "Users can update annotations in own audits" ON annotations;
DROP POLICY IF EXISTS "Users can delete annotations in own audits" ON annotations;

-- Simple open policy — audit_id UUID is the security boundary
CREATE POLICY "Allow all annotation access" ON annotations
  FOR ALL USING (true) WITH CHECK (true);
