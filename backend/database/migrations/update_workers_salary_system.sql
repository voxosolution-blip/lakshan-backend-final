-- ============================================
-- UPDATE WORKERS SALARY SYSTEM (Professional ERP Design)
-- ============================================

-- 1. Update workers table: Add daily_salary, EPF/ETF percentages, job_role
ALTER TABLE workers 
  ADD COLUMN IF NOT EXISTS daily_salary DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS epf_percentage DECIMAL(5, 2) DEFAULT 8.00,
  ADD COLUMN IF NOT EXISTS etf_percentage DECIMAL(5, 2) DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS job_role VARCHAR(100);

-- Migrate existing main_salary to daily_salary (assuming 26 working days)
UPDATE workers 
SET daily_salary = CASE 
  WHEN main_salary > 0 THEN ROUND(main_salary / 26.0, 2)
  ELSE 0.00
END
WHERE daily_salary = 0.00 AND main_salary > 0;

-- 2. Create salary_bonus table (monthly bonus and late hour bonus)
CREATE TABLE IF NOT EXISTS salary_bonus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    monthly_bonus DECIMAL(10, 2) DEFAULT 0.00,
    late_bonus DECIMAL(10, 2) DEFAULT 0.00, -- Late hour bonus
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(worker_id, year, month)
);

CREATE INDEX idx_salary_bonus_worker ON salary_bonus(worker_id);
CREATE INDEX idx_salary_bonus_month_year ON salary_bonus(year, month);
CREATE INDEX idx_salary_bonus_worker_month_year ON salary_bonus(worker_id, year, month);

CREATE TRIGGER update_salary_bonus_updated_at BEFORE UPDATE ON salary_bonus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Rename worker_salary_payments to payroll (more professional)
ALTER TABLE IF EXISTS worker_salary_payments RENAME TO payroll;

-- 4. Update payroll table structure
ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS daily_salary DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS working_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_salary DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS epf_amount DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS etf_amount DECIMAL(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_deductions DECIMAL(10, 2) DEFAULT 0.00;

-- Update existing payroll records to use new structure
UPDATE payroll
SET 
  working_days = COALESCE(days_present, 0),
  gross_salary = COALESCE(main_salary, 0) + COALESCE(monthly_bonus, 0) + COALESCE(late_hour_salary, 0),
  total_deductions = COALESCE(advance_amount, 0)
WHERE working_days = 0;

-- Rename columns for consistency
DO $$ 
BEGIN
  -- Rename days_present to working_days if exists
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'payroll' AND column_name = 'days_present') THEN
    ALTER TABLE payroll RENAME COLUMN days_present TO working_days;
  END IF;
  
  -- Rename late_hour_salary to late_bonus if exists
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'payroll' AND column_name = 'late_hour_salary') THEN
    ALTER TABLE payroll RENAME COLUMN late_hour_salary TO late_bonus;
  END IF;
END $$;

-- 5. Update worker_advances: Add time field
ALTER TABLE worker_advances
  ADD COLUMN IF NOT EXISTS time TIME DEFAULT CURRENT_TIME;

-- Comments
COMMENT ON TABLE workers IS 'Worker/Employee master data with daily salary and EPF/ETF percentages';
COMMENT ON TABLE salary_bonus IS 'Monthly bonus and late hour bonus per worker';
COMMENT ON TABLE payroll IS 'Monthly payroll records with calculated salaries and deductions';
COMMENT ON TABLE worker_advances IS 'Advance salary payments (deducted from monthly salary)';

