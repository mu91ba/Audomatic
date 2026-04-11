-- Migration 008: Fix DELETE policies for legacy audits (user_id IS NULL)
--
-- The DELETE policies for annotations, pages, and design_tokens require
-- audits.user_id = auth.uid(), but audits created before auth was added
-- have user_id = NULL. SELECT and UPDATE already allow NULL; DELETE didn't.
-- This adds the same NULL escape hatch so deletes work on legacy audits.

-- Annotations DELETE
DROP POLICY IF EXISTS "Users can delete annotations in own audits" ON annotations;
CREATE POLICY "Users can delete annotations in own audits" ON annotations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = annotations.audit_id
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

-- Pages DELETE
DROP POLICY IF EXISTS "Users can delete pages in own audits" ON pages;
CREATE POLICY "Users can delete pages in own audits" ON pages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = pages.audit_id
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

-- Design tokens DELETE
DROP POLICY IF EXISTS "Users can delete design_tokens in own audits" ON design_tokens;
CREATE POLICY "Users can delete design_tokens in own audits" ON design_tokens
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = design_tokens.audit_id
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );
