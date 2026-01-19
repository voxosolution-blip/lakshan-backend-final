@
import { Pool } from "pg";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("Using .env from:", join(process.cwd(), ".env"));

let connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

if (!connectionString && process.env.DB_HOST) {
  const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
  connectionString = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
  console.log("Using constructed connection string");
}

if (!connectionString) {
  console.error("Error: No connection string found");
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: (process.env.NODE_ENV === "production" || process.env.DATABASE_PUBLIC_URL) ? { rejectUnauthorized: false } : false,
});

async function runMigrate() {
    try {
        const migrationsDir = join(__dirname, "database", "migrations");
        const files = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
        console.log(`Found ${files.length} migrations.`);
        
        for (const file of files) {
            console.log(`Running ${file}...`);
            const sql = readFileSync(join(migrationsDir, file), "utf8");
            try {
                await pool.query(sql);
                console.log("  Success");
            } catch (err) {
                if (err.message.includes("already exists") || err.message.includes("duplicate")) {
                    console.log("  Skipping (exists)");
                } else {
                    console.error("  Failed:", err.message);
                }
            }
        }
        console.log("Done.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
runMigrate();
@
