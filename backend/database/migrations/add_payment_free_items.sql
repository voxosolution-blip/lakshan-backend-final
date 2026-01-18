-- Track free items given during payment/receipt (promotions, free yogurt, etc.)
-- These are deducted from salesperson allocations at the time of payment creation.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS payment_free_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(payment_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_free_items_payment ON payment_free_items(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_free_items_product ON payment_free_items(product_id);


