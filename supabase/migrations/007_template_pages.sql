-- Migration 007: Smart template page tracking
--
-- Adds two columns to the pages table:
--   is_template   - true when this page is a representative for a group of
--                   similar pages (e.g. one blog post standing in for 200)
--   template_count - how many real pages this representative stands for
--                   (null for regular pages, e.g. 200 for a blog post group)

ALTER TABLE pages ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS template_count INTEGER;

-- Partial index — only indexes the rows where is_template is true, keeping it tiny
CREATE INDEX IF NOT EXISTS idx_pages_is_template
  ON pages(audit_id, is_template)
  WHERE is_template = TRUE;
