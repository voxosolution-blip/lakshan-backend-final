-- ============================================
-- REPORTING VIEWS (Audit-ready, SQL-first)
-- Lakshan Yogurt ERP
-- ============================================
-- NOTE:
-- These views are intentionally "detail-first" (transaction-level).
-- Date filtering + summaries are done via SQL queries over these views (in backend),
-- so UI/Excel/PDF all consume the same source of truth.

-- --------------------------------------------
-- Helpers
-- --------------------------------------------
CREATE OR REPLACE VIEW v_setting_milk_price AS
SELECT
  COALESCE(
    (SELECT value::numeric FROM settings WHERE key = 'milk_price_per_liter' LIMIT 1),
    200::numeric
  ) AS milk_price_per_liter;

-- --------------------------------------------
-- MILK COLLECTION (Detail)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_milk_collection_details AS
SELECT
  mc.id,
  mc.date,
  mc.time,
  mc.farmer_id,
  f.name AS farmer_name,
  mc.quantity_liters,
  COALESCE(NULLIF(f.milk_rate, 0), (SELECT milk_price_per_liter FROM v_setting_milk_price))::numeric(10,2) AS rate_per_liter,
  (mc.quantity_liters * COALESCE(NULLIF(f.milk_rate, 0), (SELECT milk_price_per_liter FROM v_setting_milk_price)))::numeric(12,2) AS amount,
  mc.notes,
  mc.created_at,
  mc.updated_at
FROM milk_collections mc
JOIN farmers f ON f.id = mc.farmer_id;

-- --------------------------------------------
-- SALES (Detail = Invoice lines)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_sales_details AS
WITH payment_totals AS (
  SELECT
    p.sale_id,
    COALESCE(SUM(p.cash_amount), 0)::numeric(12,2) AS cash_amount,
    COALESCE(SUM(p.cheque_amount), 0)::numeric(12,2) AS cheque_amount,
    COALESCE(SUM(p.total_amount), 0)::numeric(12,2) AS paid_amount
  FROM payments p
  WHERE p.status <> 'cancelled'
  GROUP BY p.sale_id
)
SELECT
  s.id AS sale_id,
  ('INV-' || SUBSTRING(s.id::text, 1, 8)) AS invoice_no,
  s.date,
  s.salesperson_id,
  u.name AS salesperson_name,
  s.buyer_id,
  b.shop_name AS customer_name,
  s.payment_status,
  si.id AS sale_item_id,
  si.product_id,
  pr.name AS product_name,
  si.quantity,
  si.price AS unit_price,
  si.subtotal AS line_amount,
  s.total_amount AS invoice_total,
  COALESCE(pt.cash_amount, 0) AS cash_paid,
  COALESCE(pt.cheque_amount, 0) AS cheque_paid,
  COALESCE(pt.paid_amount, 0) AS total_paid,
  GREATEST(0, (s.total_amount - COALESCE(pt.paid_amount, 0)))::numeric(12,2) AS outstanding,
  CASE
    WHEN COALESCE(pt.cash_amount, 0) > 0 AND COALESCE(pt.cheque_amount, 0) > 0 THEN 'CASH+CHEQUE'
    WHEN COALESCE(pt.cheque_amount, 0) > 0 THEN 'CHEQUE'
    WHEN COALESCE(pt.cash_amount, 0) > 0 THEN 'CASH'
    ELSE 'N/A'
  END AS payment_type,
  s.notes,
  s.created_at,
  s.updated_at
FROM sales s
LEFT JOIN buyers b ON b.id = s.buyer_id
LEFT JOIN users u ON u.id = s.salesperson_id
JOIN sale_items si ON si.sale_id = s.id
JOIN products pr ON pr.id = si.product_id
LEFT JOIN payment_totals pt ON pt.sale_id = s.id;

-- --------------------------------------------
-- RETURNS (Detail = Return lines)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_returns_details AS
SELECT
  r.id AS return_id,
  r.created_at::date AS return_date,
  r.sale_id,
  ('INV-' || SUBSTRING(r.sale_id::text, 1, 8)) AS invoice_no,
  s.buyer_id,
  b.shop_name AS customer_name,
  r.product_id,
  p.name AS product_name,
  r.quantity,
  COALESCE(si.price, p.selling_price)::numeric(10,2) AS unit_price_ref,
  (r.quantity * COALESCE(si.price, p.selling_price))::numeric(12,2) AS return_amount_estimated,
  r.reason,
  r.replacement_given,
  r.replacement_product_id,
  rp.name AS replacement_product_name,
  r.replacement_quantity,
  r.processed_by,
  u.name AS processed_by_name
FROM returns r
LEFT JOIN sales s ON s.id = r.sale_id
LEFT JOIN buyers b ON b.id = s.buyer_id
LEFT JOIN products p ON p.id = r.product_id
LEFT JOIN products rp ON rp.id = r.replacement_product_id
LEFT JOIN users u ON u.id = r.processed_by
LEFT JOIN sale_items si ON si.sale_id = r.sale_id AND si.product_id = r.product_id;

-- --------------------------------------------
-- PAYMENTS (Detail)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_payments_details AS
SELECT
  p.id AS payment_id,
  p.payment_date,
  p.status AS payment_status,
  p.sale_id,
  ('INV-' || SUBSTRING(p.sale_id::text, 1, 8)) AS invoice_no,
  s.date AS sale_date,
  s.buyer_id,
  b.shop_name AS customer_name,
  p.cash_amount,
  p.cheque_amount,
  p.total_amount,
  CASE
    WHEN p.cash_amount > 0 AND p.cheque_amount > 0 THEN 'CASH+CHEQUE'
    WHEN p.cheque_amount > 0 THEN 'CHEQUE'
    WHEN p.cash_amount > 0 THEN 'CASH'
    ELSE 'N/A'
  END AS payment_type,
  p.notes,
  p.created_at,
  p.updated_at
FROM payments p
LEFT JOIN sales s ON s.id = p.sale_id
LEFT JOIN buyers b ON b.id = s.buyer_id;

-- --------------------------------------------
-- CHEQUES (Detail)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_cheques_details AS
SELECT
  c.id AS cheque_id,
  c.payment_id,
  p.sale_id,
  ('INV-' || SUBSTRING(p.sale_id::text, 1, 8)) AS invoice_no,
  b.shop_name AS customer_name,
  c.cheque_number,
  c.bank_name,
  c.cheque_date,
  c.return_date,
  c.amount,
  c.status AS cheque_status,
  c.notes,
  c.created_at,
  c.updated_at
FROM cheques c
JOIN payments p ON p.id = c.payment_id
LEFT JOIN sales s ON s.id = p.sale_id
LEFT JOIN buyers b ON b.id = s.buyer_id;

-- --------------------------------------------
-- EXPENSES (Detail)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_expenses_details AS
SELECT
  e.id AS expense_id,
  e.date,
  e.type,
  e.category,
  e.description,
  e.amount,
  e.created_by,
  u.name AS created_by_name,
  e.created_at,
  e.updated_at
FROM expenses e
LEFT JOIN users u ON u.id = e.created_by;

-- --------------------------------------------
-- PRODUCTION (Detail + computed production_cost from BOM)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_production_details AS
SELECT
  p.id AS production_id,
  p.date AS production_date,
  p.product_id,
  pr.name AS product_name,
  p.quantity_produced,
  p.batch,
  p.notes,
  p.created_by,
  u.name AS created_by_name,
  COALESCE((
    SELECT SUM(
      (pb.quantity_required * p.quantity_produced) * COALESCE(ii.price, 0)
    )
    FROM product_bom pb
    JOIN inventory_items ii ON ii.id = pb.inventory_item_id
    WHERE pb.product_id = p.product_id
  ), 0)::numeric(12,2) AS production_cost_estimated,
  p.created_at,
  p.updated_at
FROM productions p
JOIN products pr ON pr.id = p.product_id
LEFT JOIN users u ON u.id = p.created_by;

-- --------------------------------------------
-- PAYROLL (Detail) - if payroll table exists
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_payroll_details AS
SELECT
  pr.id AS payroll_id,
  pr.worker_id,
  w.name AS worker_name,
  pr.month,
  pr.year,
  pr.daily_salary,
  pr.working_days,
  pr.main_salary,
  pr.monthly_bonus,
  pr.late_bonus,
  pr.advance_amount,
  pr.epf_amount,
  pr.etf_amount,
  pr.gross_salary,
  pr.total_deductions,
  pr.net_pay,
  pr.created_at,
  pr.updated_at
FROM payroll pr
JOIN workers w ON w.id = pr.worker_id;

-- --------------------------------------------
-- INVENTORY (Snapshot)
-- --------------------------------------------
CREATE OR REPLACE VIEW v_report_inventory_snapshot AS
SELECT
  i.id AS inventory_item_id,
  i.name AS item_name,
  c.name AS category_name,
  i.unit,
  i.quantity::numeric(12,2) AS current_stock,
  i.min_quantity::numeric(12,2) AS min_stock_level,
  i.price::numeric(12,2) AS unit_price,
  (i.quantity * COALESCE(i.price, 0))::numeric(12,2) AS stock_value,
  i.expiry_date,
  (i.expiry_date IS NOT NULL AND i.expiry_date <= CURRENT_DATE + INTERVAL '7 days') AS expiring_soon,
  (i.quantity <= COALESCE(i.min_quantity, 0)) AS low_stock
FROM inventory_items i
LEFT JOIN inventory_categories c ON c.id = i.category_id;


