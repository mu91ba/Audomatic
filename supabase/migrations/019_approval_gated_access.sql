-- Migration 019: approval-gated accounts, and shares that are genuinely read-only
--
-- Three problems this fixes, in order of severity.
--
-- 1. The role lived in auth.users.user_metadata, which the user themselves can
--    write: components/auth/account-settings-modal.tsx already calls
--    supabase.auth.updateUser({ data: ... }) to save a display name. Any
--    invited viewer could therefore call updateUser({ data: { role: 'owner' } })
--    from the browser console and walk straight past the invitee check in
--    app/api/start-audit. The role now lives in `app_users`, which no client
--    role may write at all.
--
-- 2. Access defaulted to "full account". lib/role.ts treated every account
--    without role='invitee' as an owner, and Supabase signups are open, so
--    anyone who registered could run crawls. The default is now `viewer`,
--    applied by a trigger on auth.users, so an account that slips past the UI
--    still cannot do anything until it is approved.
--
-- 3. The `audit_shares` UPDATE policy from migration 011 had a USING clause and
--    no WITH CHECK. Postgres validates only the pre-update row against USING,
--    so a viewer holding one legitimate share could repoint its audit_id at any
--    other audit whose uuid they knew, and read it. A WITH CHECK cannot fix
--    this on its own (the rewritten row still matches on their own email), so
--    the policy is removed outright and replaced by accept_pending_shares().
--
-- Safe to re-run.

-- ============================================================
-- 1. app_users — the role table. Server-writable only.
-- ============================================================
CREATE TABLE IF NOT EXISTS app_users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_app_users_role  ON app_users (role);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Role helpers
--
-- SECURITY DEFINER so they read app_users without tripping its own RLS —
-- an is_admin() that had to pass the app_users SELECT policy, which itself
-- calls is_admin(), would recurse forever.
-- ============================================================
CREATE OR REPLACE FUNCTION current_app_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM app_users WHERE id = auth.uid()),
    'viewer'   -- unknown account: deny by default
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT current_app_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Who may start a crawl and own audits. Viewers may not.
CREATE OR REPLACE FUNCTION can_create_audits()
RETURNS BOOLEAN AS $$
  SELECT current_app_role() IN ('admin', 'member');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. app_users RLS — read your own row; admins read everyone.
--    No INSERT/UPDATE/DELETE policy exists for any client role, so those are
--    denied outright. Writes happen through the service key in the API routes
--    and through the trigger below. That is the whole point of the table.
-- ============================================================
DROP POLICY IF EXISTS "Users can view own app_user row" ON app_users;
CREATE POLICY "Users can view own app_user row" ON app_users
  FOR SELECT USING (id = auth.uid() OR is_admin());

-- ============================================================
-- 4. Every new auth account starts as a viewer
--
-- Covers accounts created by the Supabase invite flow, and any that arrive via
-- /auth/v1/signup while that endpoint is still enabled. Without this a brand
-- new account has no app_users row, which current_app_role() reads as 'viewer'
-- anyway — the trigger just makes it explicit and listable in /admin.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO app_users (id, email, role)
  VALUES (NEW.id, NEW.email, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- Keep the denormalised email in step if the account's email changes.
CREATE OR REPLACE FUNCTION handle_auth_user_email_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE app_users
       SET email = NEW.email, updated_at = NOW()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_auth_user_email_change();

-- ============================================================
-- 5. Backfill existing accounts
--
-- Deliberately NOT "everyone keeps what they had". Signups were open, so
-- grandfathering every existing account as a member would preserve exactly the
-- access this migration exists to remove. The rule:
--
--   owns at least one audit            -> member   (demonstrably a real user)
--   the admin email                    -> admin
--   everything else                    -> viewer
--
-- Anyone wrongly demoted is one click away in /admin. The NOTICE below lists
-- them so the demotion is never silent.
-- ============================================================
INSERT INTO app_users (id, email, role)
SELECT
  u.id,
  u.email,
  CASE
    WHEN lower(u.email) = 'muneeba.design@gmail.com' THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM audits a WHERE a.user_id = u.id) THEN 'member'
    ELSE 'viewer'
  END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Make sure the admin is an admin even if the row already existed.
UPDATE app_users SET role = 'admin', updated_at = NOW()
WHERE lower(email) = 'muneeba.design@gmail.com' AND role <> 'admin';

DO $$
DECLARE
  demoted TEXT;
  admin_count INT;
  account_count INT;
BEGIN
  SELECT string_agg(email, ', ' ORDER BY email) INTO demoted
  FROM app_users WHERE role = 'viewer';

  IF demoted IS NOT NULL THEN
    RAISE NOTICE 'Migration 019: these accounts are now viewers (no crawling). Promote any that should be members at /admin: %', demoted;
  END IF;

  SELECT COUNT(*) INTO account_count FROM app_users;
  SELECT COUNT(*) INTO admin_count FROM app_users WHERE role = 'admin';

  -- An empty auth.users means a from-scratch rebuild, where there is nobody to
  -- make an admin yet; 001-019 must still apply cleanly on a new project. Only
  -- an existing deployment that ends up with no admin is a real problem, since
  -- there would then be no way to approve anyone.
  IF account_count > 0 AND admin_count = 0 THEN
    RAISE EXCEPTION
      'Migration 019 aborted: % accounts exist but none is an admin. muneeba.design@gmail.com '
      'is not in auth.users — change the admin email in section 5 to an account that is, or '
      'nobody can approve applications.', account_count;
  END IF;

  IF account_count = 0 THEN
    RAISE NOTICE 'Migration 019: no accounts yet. The first account must be promoted to admin by hand: UPDATE app_users SET role = ''admin'' WHERE email = ''you@example.com'';';
  END IF;
END $$;

-- ============================================================
-- 6. access_requests — people applying for an account
--
-- RLS is enabled with no policies at all, so anon and authenticated can touch
-- nothing. Applications arrive through /api/request-access and are reviewed
-- through /api/admin/access-requests, both of which use the service key. An
-- anonymous INSERT policy would have been the obvious shortcut and would have
-- let anyone enumerate or forge rows.
-- ============================================================
CREATE TABLE IF NOT EXISTS access_requests (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL,
  name        TEXT,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id)
);

-- One live application per address; re-applying after a rejection is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending_email
  ON access_requests (lower(email)) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests (status, created_at DESC);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. Only approved accounts may create audits
--
-- The 403 in app/api/start-audit is a courtesy message, not a control: the
-- browser holds a Supabase token and can INSERT into audits directly. This is
-- where "viewers cannot crawl" is actually enforced.
-- ============================================================
DROP POLICY IF EXISTS "Users can create own audits" ON audits;
CREATE POLICY "Approved users can create own audits" ON audits
  FOR INSERT WITH CHECK (auth.uid() = user_id AND can_create_audits());

-- ============================================================
-- 8. Shared audits become read-only
--
-- Migration 011 gave anyone with access INSERT and UPDATE on annotations, so a
-- viewer could write to any audit shared with them. Writes are now the audit
-- owner's alone; SELECT is unchanged, so viewers still see the owner's notes.
-- ============================================================
DROP POLICY IF EXISTS "Users can create annotations in accessible audits" ON annotations;
CREATE POLICY "Owner can create annotations" ON annotations
  FOR INSERT WITH CHECK (user_is_audit_owner(audit_id));

DROP POLICY IF EXISTS "Users can update annotations in accessible audits" ON annotations;
CREATE POLICY "Owner can update annotations" ON annotations
  FOR UPDATE USING (user_is_audit_owner(audit_id));

-- ============================================================
-- 9. Close the audit_shares UPDATE hole
--
-- See note 3 at the top. The client no longer updates audit_shares at all;
-- components/auth/auth-provider.tsx calls accept_pending_shares() instead,
-- which can only ever match rows addressed to the caller's own JWT email and
-- only ever writes the three acceptance columns.
-- ============================================================
DROP POLICY IF EXISTS "Shared user can update own share" ON audit_shares;

CREATE OR REPLACE FUNCTION accept_pending_shares()
RETURNS INTEGER AS $$
DECLARE
  claimed INTEGER;
  caller_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE audit_shares
     SET shared_with_user_id = auth.uid(),
         status              = 'accepted',
         accepted_at         = NOW()
   WHERE lower(shared_with_email) = lower(caller_email)
     AND shared_with_user_id IS NULL;

  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION accept_pending_shares() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_pending_shares() TO authenticated;
