-- Add stock_status column to inventory_items table
-- Replaces the quantity-based management with a 3-level stock status system

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'ok'
  CONSTRAINT stock_status_check CHECK (stock_status IN ('ok', 'low', 'out'));

-- Create index for fast filtering by status
CREATE INDEX IF NOT EXISTS inventory_items_status_idx
  ON inventory_items(family_id, stock_status);
