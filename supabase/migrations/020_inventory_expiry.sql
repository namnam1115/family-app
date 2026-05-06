-- Add expiry_date column to track food/product expiration dates
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS expiry_date date;
