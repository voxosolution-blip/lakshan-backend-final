import { Pool } from "pg";
import "dotenv/config";

console.log(" Starting Comprehensive Salary & Settings Fix...");

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error(" No DATABASE_URL found.");
    process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function fixDatabase() {
  try {
    // 1. Fix settings table (Add updated_by column)
    console.log("1. Updating settings table...");
    await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id)`);

    // 2. Insert missing salary settings
    console.log("2. Inserting missing worker settings...");
    await pool.query(`
      INSERT INTO settings (key, value, description)
      VALUES 
        ('worker_default_daily_salary', '1500', 'Default daily salary for workers in Rs.'),
        ('worker_default_epf_percentage', '8', 'EPF percentage for workers'),
        ('worker_default_etf_percentage', '3', 'ETF percentage for workers'),
        ('worker_default_free_products', '[]', 'Default free products for workers (JSON array)')
      ON CONFLICT (key) DO NOTHING
    `);

    // 3. Fix workers table (Missing columns)
    console.log("3. Updating workers table...");
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'phone') THEN
            ALTER TABLE workers ADD COLUMN phone VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'address') THEN
            ALTER TABLE workers ADD COLUMN address TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'epf_number') THEN
            ALTER TABLE workers ADD COLUMN epf_number VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'etf_number') THEN
            ALTER TABLE workers ADD COLUMN etf_number VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'daily_salary') THEN
            ALTER TABLE workers ADD COLUMN daily_salary DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'main_salary') THEN
            ALTER TABLE workers ADD COLUMN main_salary DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'epf_percentage') THEN
            ALTER TABLE workers ADD COLUMN epf_percentage DECIMAL(5, 2) DEFAULT 8.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'etf_percentage') THEN
            ALTER TABLE workers ADD COLUMN etf_percentage DECIMAL(5, 2) DEFAULT 3.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'job_role') THEN
            ALTER TABLE workers ADD COLUMN job_role VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workers' AND column_name = 'updated_at') THEN
            ALTER TABLE workers ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `);

    // 4. Fix payroll table (Missing columns)
    console.log("4. Updating payroll table...");
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'daily_salary') THEN
            ALTER TABLE payroll ADD COLUMN daily_salary DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'working_days') THEN
            ALTER TABLE payroll ADD COLUMN working_days INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'main_salary') THEN
            ALTER TABLE payroll ADD COLUMN main_salary DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'monthly_bonus') THEN
            ALTER TABLE payroll ADD COLUMN monthly_bonus DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'late_bonus') THEN
            ALTER TABLE payroll ADD COLUMN late_bonus DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'advance_amount') THEN
            ALTER TABLE payroll ADD COLUMN advance_amount DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'epf_amount') THEN
            ALTER TABLE payroll ADD COLUMN epf_amount DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'etf_amount') THEN
            ALTER TABLE payroll ADD COLUMN etf_amount DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'gross_salary') THEN
            ALTER TABLE payroll ADD COLUMN gross_salary DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'total_deductions') THEN
            ALTER TABLE payroll ADD COLUMN total_deductions DECIMAL(10, 2) DEFAULT 0.00;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payroll' AND column_name = 'created_by') THEN
            ALTER TABLE payroll ADD COLUMN created_by UUID REFERENCES users(id);
        END IF;
      END $$;
    `);

    // 5. Ensure helper tables exist
    console.log("5. Checking helper tables (advances/bonus)...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS worker_advances (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS salary_bonus (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        monthly_bonus DECIMAL(10, 2) DEFAULT 0.00,
        late_bonus DECIMAL(10, 2) DEFAULT 0.00,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(worker_id, year, month)
      );
    `);

    console.log(" ALL Salary & Settings Fixes Applied Successfully.");
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error(" Database Fix Failed:", error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

fixDatabase();
