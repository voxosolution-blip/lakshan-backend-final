@
const { Pool } = require("pg");
const { readFileSync, readdirSync } = require("fs");
const path = require("path");
require("dotenv").config();

console.log("DB_HOST:", process.env.DB_HOST);

let connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!connectionString && process.env.DB_HOST) {
  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
  connectionString = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

if (!connectionString) {
  console.error("No connection string.");
   // Fallback for debug: try default
   // connectionString = "postgresql://postgres:postgres@localhost:5435/yogurt_erp";
   process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: (process.env.NODE_ENV === "production" || process.env.DATABASE_PUBLIC_URL) ? { rejectUnauthorized: false } : false,
});

async function run() {
    try {
        const migrationsDir = path.join(__dirname, "database", "migrations");
        const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
        console.log("Found migration files:", files.length);
        
        for (const file of files) {
            console.log("Processing " + file);
            const sql = readFileSync(path.join(migrationsDir, file), "utf8");
            try {
                await pool.query(sql);
            } catch (e) {
                if (e.message.includes("already exists") || e.message.includes("duplicate")) {
                    // ignore
                } else {
                    console.error("Error in " + file + ": " + e.message);
                }
            }
        }
        console.log("All migrations applied.");
        process.exit(0); // Force exit
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
@
