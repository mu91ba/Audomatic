-- Migration: Add user authentication support
-- 
-- This migration adds user_id to audits and updates RLS policies
-- to filter data by authenticated user

-- Add user_id column to audits table
-- Nullable to preserve existing data from before auth was implemented
ALTER TABLE audits ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for faster user-based queries
CREATE INDEX IF NOT EXISTS idx_audits_user_id ON audits(user_id);

-- Drop existing public policies
DROP POLICY IF EXISTS "Allow all access to audits" ON audits;
DROP POLICY IF EXISTS "Allow all access to pages" ON pages;
DROP POLICY IF EXISTS "Allow all access to design_tokens" ON design_tokens;
DROP POLICY IF EXISTS "Allow all access to annotations" ON annotations;

-- Create new RLS policies for authenticated users

-- Audits: Users can only see and manage their own audits
CREATE POLICY "Users can view own audits" ON audits
  FOR SELECT USING (
    auth.uid() = user_id OR user_id IS NULL
  );

CREATE POLICY "Users can create own audits" ON audits
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

CREATE POLICY "Users can update own audits" ON audits
  FOR UPDATE USING (
    auth.uid() = user_id OR user_id IS NULL
  );

CREATE POLICY "Users can delete own audits" ON audits
  FOR DELETE USING (
    auth.uid() = user_id
  );

-- Pages: Access based on parent audit ownership
CREATE POLICY "Users can view pages of own audits" ON pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = pages.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can create pages in own audits" ON pages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = pages.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can update pages in own audits" ON pages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = pages.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can delete pages in own audits" ON pages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = pages.audit_id 
      AND audits.user_id = auth.uid()
    )
  );

-- Design tokens: Access based on parent audit ownership
CREATE POLICY "Users can view design_tokens of own audits" ON design_tokens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = design_tokens.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can create design_tokens in own audits" ON design_tokens
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = design_tokens.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can update design_tokens in own audits" ON design_tokens
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = design_tokens.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can delete design_tokens in own audits" ON design_tokens
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = design_tokens.audit_id 
      AND audits.user_id = auth.uid()
    )
  );

-- Annotations: Access based on parent audit ownership
CREATE POLICY "Users can view annotations of own audits" ON annotations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = annotations.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can create annotations in own audits" ON annotations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = annotations.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can update annotations in own audits" ON annotations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = annotations.audit_id 
      AND (audits.user_id = auth.uid() OR audits.user_id IS NULL)
    )
  );

CREATE POLICY "Users can delete annotations in own audits" ON annotations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audits 
      WHERE audits.id = annotations.audit_id 
      AND audits.user_id = auth.uid()
    )
  );



