-- Create audits table
-- This table stores information about each website audit
CREATE TABLE IF NOT EXISTS audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Create pages table
-- This table stores information about each page discovered during the audit
CREATE TABLE IF NOT EXISTS pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  screenshot_url TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  parent_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create design_tokens table
-- This table stores the extracted design tokens (colors and typography) for each audit
CREATE TABLE IF NOT EXISTS design_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  typography JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DEPRECATED: sticky_notes table has been replaced by the unified 'annotations' table
-- See migration 003_annotations.sql for the new table
-- This table is kept for reference but should be dropped in new installations
-- Create sticky_notes table  
-- This table stores user-created notes on the canvas
CREATE TABLE IF NOT EXISTS sticky_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  color TEXT DEFAULT '#fef3c7',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pages_audit_id ON pages(audit_id);
CREATE INDEX IF NOT EXISTS idx_pages_level ON pages(level);
CREATE INDEX IF NOT EXISTS idx_design_tokens_audit_id ON design_tokens(audit_id);
CREATE INDEX IF NOT EXISTS idx_sticky_notes_audit_id ON sticky_notes(audit_id);

-- Enable Row Level Security (RLS)
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticky_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth for now)
-- These allow anyone to read/write data
-- TODO: Add authentication and update these policies in the future

CREATE POLICY "Allow all access to audits" ON audits
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to pages" ON pages
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to design_tokens" ON design_tokens
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to sticky_notes" ON sticky_notes
  FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for screenshots bucket
CREATE POLICY "Allow public access to screenshots" ON storage.objects
  FOR ALL USING (bucket_id = 'screenshots');




