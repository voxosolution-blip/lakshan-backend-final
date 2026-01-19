import { Pool } from "pg";
import "dotenv/config";

console.log(" Adding settings table...");

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
    console.log("Creating settings table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Adding default milk price settings...");
    await pool.query(`
      INSERT INTO settings (key, value, description)
      VALUES 
        (` + "'milk_price_per_liter'" + `, ` + "'100'" + `, ` + "'Default milk price per liter in Rs.'" + `),
        (` + "'default_worker_daily_salary'" + `, ` + "'1500'" + `, ` + "'Default daily salary for workers in Rs.'" + `),
        (` + "'epf_percentage'" + `, ` + "'8'" + `, ` + "'EPF percentage for workers'" + `),
        (` + "'etf_percentage'" + `, ` + "'3'" + `, ` + "'ETF percentage for workers'" + `)
      ON CONFLICT (key) DO NOTHING
    `);

    console.log(" Settings table created successfully.");
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
