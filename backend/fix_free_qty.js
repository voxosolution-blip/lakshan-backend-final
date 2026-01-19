import { Pool } from "pg";
import "dotenv/config";

console.log(" Adding free_quantity column...");

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
    console.log("Adding free_quantity to sale_items...");
    await pool.query(`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS free_quantity DECIMAL(10, 2) DEFAULT 0`);

    console.log(" free_quantity column added successfully.");
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
