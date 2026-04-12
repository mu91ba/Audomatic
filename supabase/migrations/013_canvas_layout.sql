-- Per-audit canvas layout: map of node id -> { x, y } saved on drag-end
-- so the hierarchy view keeps the user's rearrangement between sessions.
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS canvas_layout jsonb;
