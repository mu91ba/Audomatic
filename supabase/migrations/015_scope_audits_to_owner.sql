-- Migration 015: Scope audits strictly to owner + shared users
--
-- Problem: invited collaborators saw every audit in the owner's dashboard,
-- not just the one shared with them. Two causes:
--
--   1. A permissive "Allow all for MVP" policy on audits (created manually
--      via the Supabase dashboard, so it isn't in migration history) allowed
--      SELECT for any authenticated user, bypassing the scoped policies from
--      migrations 005/011. Postgres combines permissive policies with OR, so
--      one true-for-all policy is enough to leak everything.
--
--   2. user_can_access_audit() (from migrations 011/012) returned true when
--      audits.user_id IS NULL. All legacy pre-auth audits still have NULL
--      user_id, so they were visible to *every* authenticated user — including
--      invitees. The same NULL escape hatch was in user_is_audit_owner() and
--      the direct UPDATE/DELETE policies on audits.
--
-- Fix:
--   a) Backfill NULL user_ids to the owner so the tighter rules don't lock
--      the owner out of their own legacy audits.
--   b) Drop the "Allow all for MVP" catch-all on every table it might exist on.
--   c) Redefine the access helpers without the NULL escape.
--   d) Tighten the direct UPDATE/DELETE policies on audits.

-- 1. Backfill: assign legacy NULL-owner audits to the original owner.
--    (Hardcoded email since this is a single-owner deployment. If the email
--    doesn't resolve to an auth.users row, the subquery returns NULL and no
--    rows are changed — the post-migration check below will flag that.)
UPDATE audits
SET user_id = (
  SELECT id FROM auth.users WHERE email = 'mamuneeba@gmail.com' LIMIT 1
)
WHERE user_id IS NULL;

-- Safety: refuse to continue if any audits are still unowned, because the
-- tightened policies below would make them unreachable for everyone.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM audits WHERE user_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Migration 015 aborted: % audits still have user_id IS NULL. '
      'Update the backfill email above or assign them manually before rerunning.',
      orphan_count;
  END IF;
END $$;

-- 2. Drop the permissive catch-all wherever it exists
DROP POLICY IF EXISTS "Allow all for MVP" ON audits;
DROP POLICY IF EXISTS "Allow all for MVP" ON pages;
DROP POLICY IF EXISTS "Allow all for MVP" ON design_tokens;
DROP POLICY IF EXISTS "Allow all for MVP" ON annotations;

-- 3. Rewrite access helpers without the NULL escape
CREATE OR REPLACE FUNCTION user_can_access_audit(p_audit_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM audits
    WHERE audits.id = p_audit_id
    AND (
      audits.user_id = auth.uid()
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

CREATE OR REPLACE FUNCTION user_is_audit_owner(p_audit_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM audits
    WHERE audits.id = p_audit_id
    AND audits.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Tighten direct UPDATE/DELETE on audits (previously allowed NULL user_id)
DROP POLICY IF EXISTS "Users can update own audits" ON audits;
CREATE POLICY "Users can update own audits" ON audits
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own audits" ON audits;
CREATE POLICY "Users can delete own audits" ON audits
  FOR DELETE USING (auth.uid() = user_id);
