-- Migration 011: Sharing / collaborator support
--
-- New table: audit_shares
-- Links an audit to an invited user with a specific role.
-- Updates RLS policies so shared users (role = 'commenter') can:
--   - SELECT audits, pages, design_tokens
--   - SELECT, INSERT, UPDATE annotations (but NOT delete)

-- ============================================================
-- 1. Create the audit_shares table
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'commenter' CHECK (role IN ('commenter', 'editor')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(audit_id, shared_with_email)
);

CREATE INDEX idx_audit_shares_audit_id ON audit_shares(audit_id);
CREATE INDEX idx_audit_shares_user_id ON audit_shares(shared_with_user_id);
CREATE INDEX idx_audit_shares_email ON audit_shares(shared_with_email);

ALTER TABLE audit_shares ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Helper functions
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
          OR audit_shares.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION user_is_audit_owner(p_audit_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM audits
    WHERE audits.id = p_audit_id
    AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. RLS policies on audit_shares
-- ============================================================
CREATE POLICY "Owner can view shares" ON audit_shares
  FOR SELECT USING (
    invited_by = auth.uid()
    OR shared_with_user_id = auth.uid()
    OR shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Owner can create shares" ON audit_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM audits WHERE audits.id = audit_shares.audit_id AND audits.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can delete shares" ON audit_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audits WHERE audits.id = audit_shares.audit_id AND audits.user_id = auth.uid()
    )
  );

CREATE POLICY "Shared user can update own share" ON audit_shares
  FOR UPDATE USING (
    shared_with_user_id = auth.uid()
    OR shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- ============================================================
-- 4. Update AUDITS RLS — shared users can SELECT
-- ============================================================
DROP POLICY IF EXISTS "Users can view own audits" ON audits;
CREATE POLICY "Users can view accessible audits" ON audits
  FOR SELECT USING (user_can_access_audit(id));

-- ============================================================
-- 5. Update PAGES RLS — shared users can SELECT
-- ============================================================
DROP POLICY IF EXISTS "Users can view pages of own audits" ON pages;
CREATE POLICY "Users can view pages of accessible audits" ON pages
  FOR SELECT USING (user_can_access_audit(audit_id));

-- ============================================================
-- 6. Update DESIGN_TOKENS RLS — shared users can SELECT
-- ============================================================
DROP POLICY IF EXISTS "Users can view design_tokens of own audits" ON design_tokens;
CREATE POLICY "Users can view design_tokens of accessible audits" ON design_tokens
  FOR SELECT USING (user_can_access_audit(audit_id));

-- ============================================================
-- 7. Update ANNOTATIONS RLS — shared users can read/create/update
-- ============================================================
DROP POLICY IF EXISTS "Allow all annotation access" ON annotations;

CREATE POLICY "Users can view annotations of accessible audits" ON annotations
  FOR SELECT USING (user_can_access_audit(audit_id));

CREATE POLICY "Users can create annotations in accessible audits" ON annotations
  FOR INSERT WITH CHECK (user_can_access_audit(audit_id));

CREATE POLICY "Users can update annotations in accessible audits" ON annotations
  FOR UPDATE USING (user_can_access_audit(audit_id));

CREATE POLICY "Owner can delete annotations" ON annotations
  FOR DELETE USING (user_is_audit_owner(audit_id));
