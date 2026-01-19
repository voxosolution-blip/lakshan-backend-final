@
const { Pool } = require("pg"); require("dotenv").config();
const cs = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const pool = new Pool({ connectionString: cs, ssl: (process.env.NODE_ENV === "production" || process.env.DATABASE_PUBLIC_URL) ? { rejectUnauthorized: false } : false });
pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT false;")
.then(() => { console.log("Part2 done"); pool.end(); })
.catch(e => { console.error(e); process.exit(1); });
@
