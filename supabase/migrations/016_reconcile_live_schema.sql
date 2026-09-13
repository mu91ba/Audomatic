-- Reconcile the migration chain with the columns production actually had.
--
-- Production was built by hand in the dashboard and drifted from these files:
-- migrations 001-015 never create audits.updated_at / audits.title /
-- audits.audit_data or pages.template_urls, yet the live database had all four
-- and crawler.js writes template_urls on every page insert. Applying 001-015
-- to a fresh project without this would fail on the first crawl.
--
-- audits.title and audits.audit_data are unreferenced by application code and
-- are recreated only to preserve parity with the old database.

ALTER TABLE audits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE audits ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS audit_data JSONB;

ALTER TABLE pages ADD COLUMN IF NOT EXISTS template_urls JSONB;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audits_set_updated_at ON audits;
CREATE TRIGGER audits_set_updated_at
  BEFORE UPDATE ON audits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
