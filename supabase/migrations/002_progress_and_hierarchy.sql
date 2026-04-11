-- Migration: Add progress tracking and hierarchy improvements
-- 
-- IMPORTANT: After running this migration, verify Supabase Realtime is enabled:
-- 1. Go to Supabase Dashboard > Database > Replication
-- 2. Ensure 'audits' and 'pages' tables have Realtime enabled
-- 3. If not, click on each table and enable it

-- Add progress tracking columns to audits table
ALTER TABLE audits ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS processed_pages INTEGER DEFAULT 0;

-- Add discovered_from column to track which page linked to this one
-- This enables accurate parent-child hierarchy based on actual links
ALTER TABLE pages ADD COLUMN IF NOT EXISTS discovered_from TEXT;

-- Add depth column to track how deep in the hierarchy a page is
ALTER TABLE pages ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0;

-- Create index for faster hierarchy queries
CREATE INDEX IF NOT EXISTS idx_pages_discovered_from ON pages(discovered_from);
CREATE INDEX IF NOT EXISTS idx_pages_depth ON pages(depth);


