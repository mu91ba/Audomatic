-- Migration: Extended annotation types for FigJam/Miro-like canvas annotations
-- This builds upon the existing sticky_notes table to support more annotation types

-- Create a unified annotations table to replace/extend sticky_notes
-- This table supports: sticky notes, text labels, shapes, and arrows
CREATE TABLE IF NOT EXISTS annotations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  
  -- Annotation type: 'sticky_note', 'text', 'rectangle', 'circle', 'line', 'arrow'
  type TEXT NOT NULL CHECK (type IN ('sticky_note', 'text', 'rectangle', 'circle', 'line', 'arrow')),
  
  -- Content (for sticky notes and text)
  content TEXT,
  
  -- Position on canvas
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  
  -- Dimensions (for shapes)
  width FLOAT,
  height FLOAT,
  
  -- For arrows and lines: end position
  end_x FLOAT,
  end_y FLOAT,
  
  -- Styling
  color TEXT DEFAULT '#fef3c7',      -- Background/fill color
  stroke_color TEXT DEFAULT '#000000', -- Border/stroke color
  font_size INTEGER DEFAULT 14,       -- For text elements
  
  -- Z-index for layering
  z_index INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_annotations_audit_id ON annotations(audit_id);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);

-- Enable Row Level Security
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (matches existing pattern)
CREATE POLICY "Allow all access to annotations" ON annotations
  FOR ALL USING (true) WITH CHECK (true);

-- Migrate existing sticky_notes data to the new annotations table
-- (Only run if sticky_notes has data and annotations is empty)
INSERT INTO annotations (
  id, 
  audit_id, 
  type, 
  content, 
  position_x, 
  position_y, 
  color, 
  created_at, 
  updated_at
)
SELECT 
  id,
  audit_id,
  'sticky_note',
  content,
  position_x,
  position_y,
  color,
  created_at,
  updated_at
FROM sticky_notes
WHERE NOT EXISTS (SELECT 1 FROM annotations LIMIT 1);

-- Enable Realtime for annotations table
-- Note: You may need to manually enable this in Supabase Dashboard > Database > Replication
-- if ALTER PUBLICATION doesn't work with your Supabase tier


