-- Add free_quantity column to sale_items table
-- This allows tracking items given for free (no charge, but reduces inventory)

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS free_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (free_quantity >= 0);

-- Update the subtotal calculation to exclude free items
-- Note: The existing generated column already calculates quantity * price
-- We'll handle free_quantity exclusion in application logic

COMMENT ON COLUMN sale_items.free_quantity IS 'Quantity of items given for free (not charged, but reduces inventory)';

