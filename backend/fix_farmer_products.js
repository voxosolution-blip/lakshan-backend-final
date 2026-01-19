import { Pool } from "pg";
import "dotenv/config";

console.log(" Adding farmer_free_products table...");

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
    console.log("1. Creating farmer_free_products table...");
    await pool.query(
      `CREATE TABLE IF NOT EXISTS farmer_free_products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
        month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
        year INTEGER NOT NULL,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
        unit VARCHAR(50) DEFAULT ` + "'piece'" + `,
        notes TEXT,
        issued_at TIMESTAMP NULL,
        issued_by UUID NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(farmer_id, year, month, product_id)
      )`
    );

    console.log("2. Ensuring indexes exist...");
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_farmer_free_products_farmer ON farmer_free_products(farmer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_farmer_free_products_month_year ON farmer_free_products(year, month)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_farmer_free_products_product ON farmer_free_products(product_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_farmer_free_products_issued_at ON farmer_free_products(issued_at)`);

    console.log(" farmer_free_products table created successfully.");
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
