-- Track when worker free products are actually ISSUED (e.g., when salary paysheet is printed / items are given)
-- This prevents double-deduction on reprints and separates "recording" from "issuing".

ALTER TABLE worker_free_products
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS issued_by UUID NULL REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_worker_free_products_issued_at ON worker_free_products(issued_at);


