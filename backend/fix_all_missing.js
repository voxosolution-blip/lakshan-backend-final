import { Pool } from "pg";
import "dotenv/config";

console.log(" Adding ALL Missing Farmer and Worker Tables...");

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
    console.log("1. Creating farmer_free_products...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS farmer_free_products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
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

    console.log("2. Creating worker_attendance...");
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

    console.log("3. Creating worker_advances...");
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

    console.log("4. Creating worker_free_products...");
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

    console.log("5. Creating salary_bonus...");
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

    console.log(" ALL Missing Tables Created Successfully.");
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
