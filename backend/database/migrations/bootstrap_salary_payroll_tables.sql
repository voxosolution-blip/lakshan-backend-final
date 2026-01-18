-- Bootstrap (idempotent): ensure salary/payroll tables exist.
-- This is required because core schema.sql does not include the salary module tables,
-- but reporting/admin restore/reset may apply views that expect `payroll`.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure updated_at trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- WORKERS
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  epf_number VARCHAR(50),
  etf_number VARCHAR(50),
  daily_salary DECIMAL(10, 2) DEFAULT 0.00,
  main_salary DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
  monthly_bonus DECIMAL(10, 2) DEFAULT 0.00,
  late_hour_rate DECIMAL(10, 2) DEFAULT 0.00,
  epf_percentage DECIMAL(5, 2) DEFAULT 8.00,
  etf_percentage DECIMAL(5, 2) DEFAULT 3.00,
  job_role VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workers_active ON workers(is_active);
CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_workers_updated_at'
  ) THEN
    CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ATTENDANCE
CREATE TABLE IF NOT EXISTS worker_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  present BOOLEAN DEFAULT true,
  late_hours DECIMAL(4, 2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worker_id, date)
);

CREATE INDEX IF NOT EXISTS idx_worker_attendance_worker ON worker_attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_date ON worker_attendance(date);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_worker_date ON worker_attendance(worker_id, date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_worker_attendance_updated_at'
  ) THEN
    CREATE TRIGGER update_worker_attendance_updated_at BEFORE UPDATE ON worker_attendance
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ADVANCES
CREATE TABLE IF NOT EXISTS worker_advances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time TIME DEFAULT CURRENT_TIME,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_worker_advances_worker ON worker_advances(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_advances_month_year ON worker_advances(year, month);
CREATE INDEX IF NOT EXISTS idx_worker_advances_worker_month_year ON worker_advances(worker_id, year, month);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_worker_advances_updated_at'
  ) THEN
    CREATE TRIGGER update_worker_advances_updated_at BEFORE UPDATE ON worker_advances
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- WORKER FREE PRODUCTS
CREATE TABLE IF NOT EXISTS worker_free_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(50) DEFAULT 'piece',
  notes TEXT,
  issued_at TIMESTAMP NULL,
  issued_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (inventory_item_id IS NOT NULL AND product_id IS NULL) OR
    (inventory_item_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_worker_free_products_worker ON worker_free_products(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_free_products_month_year ON worker_free_products(year, month);
CREATE INDEX IF NOT EXISTS idx_worker_free_products_inventory ON worker_free_products(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_worker_free_products_product ON worker_free_products(product_id);
CREATE INDEX IF NOT EXISTS idx_worker_free_products_issued_at ON worker_free_products(issued_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_worker_free_products_updated_at'
  ) THEN
    CREATE TRIGGER update_worker_free_products_updated_at BEFORE UPDATE ON worker_free_products
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- SALARY BONUS
CREATE TABLE IF NOT EXISTS salary_bonus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  monthly_bonus DECIMAL(10, 2) DEFAULT 0.00,
  late_bonus DECIMAL(10, 2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worker_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_salary_bonus_worker ON salary_bonus(worker_id);
CREATE INDEX IF NOT EXISTS idx_salary_bonus_month_year ON salary_bonus(year, month);
CREATE INDEX IF NOT EXISTS idx_salary_bonus_worker_month_year ON salary_bonus(worker_id, year, month);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_salary_bonus_updated_at'
  ) THEN
    CREATE TRIGGER update_salary_bonus_updated_at BEFORE UPDATE ON salary_bonus
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- PAYROLL (used by worker.controller.js and reporting)
CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  daily_salary DECIMAL(10, 2) DEFAULT 0.00,
  working_days INTEGER DEFAULT 0,
  main_salary DECIMAL(10, 2) DEFAULT 0.00,
  monthly_bonus DECIMAL(10, 2) DEFAULT 0.00,
  late_bonus DECIMAL(10, 2) DEFAULT 0.00,
  advance_amount DECIMAL(10, 2) DEFAULT 0.00,
  epf_amount DECIMAL(10, 2) DEFAULT 0.00,
  etf_amount DECIMAL(10, 2) DEFAULT 0.00,
  gross_salary DECIMAL(10, 2) DEFAULT 0.00,
  total_deductions DECIMAL(10, 2) DEFAULT 0.00,
  net_pay DECIMAL(10, 2) DEFAULT 0.00,
  payment_date DATE,
  payment_status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  UNIQUE(worker_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_worker ON payroll(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_month_year ON payroll(year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_status ON payroll(payment_status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_payroll_updated_at'
  ) THEN
    CREATE TRIGGER update_payroll_updated_at BEFORE UPDATE ON payroll
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;


