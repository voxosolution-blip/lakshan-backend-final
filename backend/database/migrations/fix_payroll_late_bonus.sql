-- Fix payroll table: Add late_bonus column if it doesn't exist
-- This migration ensures the payroll table has the late_bonus column

-- Add late_bonus column if it doesn't exist
ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS late_bonus DECIMAL(10, 2) DEFAULT 0.00;

-- If late_hour_salary exists, migrate data and drop it
DO $$ 
BEGIN
  -- Check if late_hour_salary column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'payroll' AND column_name = 'late_hour_salary') THEN
    -- Migrate data from late_hour_salary to late_bonus
    UPDATE payroll
    SET late_bonus = COALESCE(late_hour_salary, 0.00)
    WHERE late_bonus = 0.00 AND late_hour_salary IS NOT NULL;
    
    -- Drop the old column
    ALTER TABLE payroll DROP COLUMN late_hour_salary;
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN payroll.late_bonus IS 'Late hour bonus for the month';

