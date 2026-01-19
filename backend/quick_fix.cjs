@
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

console.log("Starting Fix...");

let connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!connectionString && process.env.DB_HOST) {
  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
  connectionString = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

if (!connectionString) {
  console.error("No connection string found in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: (process.env.NODE_ENV === "production" || process.env.DATABASE_PUBLIC_URL) ? { rejectUnauthorized: false } : false,
});

async function run() {
    try {
        const migrationsDir = path.join(__dirname, "database", "migrations");
        
        if (!fs.existsSync(migrationsDir)) {
             console.error("No migrations dir found at " + migrationsDir);
             process.exit(1);
        }

        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
        console.log("Found " + files.length + " migrations.");
        
        for (const file of files) {
            console.log("Running " + file + "...");
            const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
            try {
                await pool.query(sql);
                console.log("  Success");
            } catch (e) {
                if (e.message.includes("already exists") || e.message.includes("duplicate")) {
                    console.log("  Already exists, skipping.");
                } else {
                    console.error("  FAILED: " + e.message);
                }
            }
        }
        console.log("All done.");
        pool.end();
    } catch(e) {
        console.error(e);
        pool.end();
    }
}
run();
@
