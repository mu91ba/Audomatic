-- Add source column to distinguish sitemap-only pages from linked pages
-- 'linked'      = discovered via actual link from a crawled page
-- 'sitemap_only' = only found in sitemap XML, not linked from any crawled page
ALTER TABLE pages ADD COLUMN IF NOT EXISTS source TEXT
  NOT NULL DEFAULT 'linked'
  CHECK (source IN ('linked', 'sitemap_only'));

-- Index for fast filtering of standalone pages per audit
CREATE INDEX IF NOT EXISTS idx_pages_source
  ON pages(audit_id, source)
  WHERE source = 'sitemap_only';
