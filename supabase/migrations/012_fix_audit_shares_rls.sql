-- Migration 012: Fix audit_shares RLS policies
--
-- The previous policies used (SELECT email FROM auth.users WHERE id = auth.uid())
-- which fails because the authenticated role cannot query auth.users directly.
-- Fix: use auth.jwt() ->> 'email' which reads from the JWT token instead.

-- ============================================================
-- 1. Fix audit_shares policies
-- ============================================================
DROP POLICY IF EXISTS "Owner can view shares" ON audit_shares;
CREATE POLICY "Owner can view shares" ON audit_shares
  FOR SELECT USING (
    invited_by = auth.uid()
    OR shared_with_user_id = auth.uid()
    OR shared_with_email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Shared user can update own share" ON audit_shares;
CREATE POLICY "Shared user can update own share" ON audit_shares
  FOR UPDATE USING (
    shared_with_user_id = auth.uid()
    OR shared_with_email = (auth.jwt() ->> 'email')
  );

-- ============================================================
-- 2. Fix helper function that also references auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION user_can_access_audit(p_audit_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM audits
    WHERE audits.id = p_audit_id
    AND (
      audits.user_id = auth.uid()
      OR audits.user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM audit_shares
        WHERE audit_shares.audit_id = p_audit_id
        AND (
          audit_shares.shared_with_user_id = auth.uid()
          OR audit_shares.shared_with_email = (auth.jwt() ->> 'email')
        )
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
