-- Track when farmer free products are actually ISSUED (e.g., when paysheet is printed / items are given)
-- This prevents double-deduction on reprints and separates "recording" from "issuing".

ALTER TABLE farmer_free_products
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS issued_by UUID NULL REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_farmer_free_products_issued_at ON farmer_free_products(issued_at);

-- Backfill existing rows as already-issued to avoid double deduction in legacy data.
-- (Legacy behavior previously deducted inventory at record time.)
UPDATE farmer_free_products
SET issued_at = COALESCE(issued_at, created_at)
WHERE issued_at IS NULL;


