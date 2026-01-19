import { Pool } from "pg";
import "dotenv/config";

console.log(" Adding Worker and Farmer Paysheet Tables...");

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
    console.log("1. Ensuring workers table exists...");
    await pool.query(`
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
      )
    `);

    console.log("2. Ensuring worker_attendance table exists...");
    await pool.query(`
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
      )
    `);

    console.log("3. Ensuring worker_advances table exists...");
    await pool.query(`
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
      )
    `);

    console.log("4. Ensuring worker_free_products table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS worker_free_products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
        year INTEGER NOT NULL,
        inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
        unit VARCHAR(50) DEFAULT ` + "'piece'" + `,
        notes TEXT,
        issued_at TIMESTAMP NULL,
        issued_by UUID NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("5. Ensuring salary_bonus table exists...");
    await pool.query(`
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
      )
    `);

    console.log("6. Ensuring payroll table exists...");
    await pool.query(`
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
        payment_status VARCHAR(20) DEFAULT ` + "'pending'" + `,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID REFERENCES users(id),
        UNIQUE(worker_id, year, month)
      )
    `);

    console.log("7. Ensuring farmer_paysheets table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS farmer_paysheets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
        month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
        year INTEGER NOT NULL,
        total_liters DECIMAL(10, 2) DEFAULT 0.00,
        milk_rate DECIMAL(10, 2) DEFAULT 0.00,
        milk_amount DECIMAL(10, 2) DEFAULT 0.00,
        allowance DECIMAL(10, 2) DEFAULT 0.00,
        gross_amount DECIMAL(10, 2) DEFAULT 0.00,
        deductions DECIMAL(10, 2) DEFAULT 0.00,
        net_pay DECIMAL(10, 2) DEFAULT 0.00,
        payment_date DATE,
        payment_status VARCHAR(20) DEFAULT ` + "'pending'" + `,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID REFERENCES users(id),
        UNIQUE(farmer_id, year, month)
      )
    `);

    console.log(" ALL Worker and Farmer Paysheet Tables Created Successfully.");
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
