-- Migration: Drop deprecated sticky_notes table
-- 
-- The sticky_notes table has been replaced by the unified 'annotations' table
-- which supports multiple annotation types (sticky notes, text, etc.)
-- 
-- Data was migrated in 003_annotations.sql
-- This migration cleans up the deprecated table

-- Drop the policy first
DROP POLICY IF EXISTS "Allow all access to sticky_notes" ON sticky_notes;

-- Drop the index
DROP INDEX IF EXISTS idx_sticky_notes_audit_id;

-- Drop the table
DROP TABLE IF EXISTS sticky_notes;



