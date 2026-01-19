@
const { Pool } = require("pg"); require("dotenv").config();
const cs = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const pool = new Pool({ connectionString: cs, ssl: (process.env.NODE_ENV === "production" || process.env.DATABASE_PUBLIC_URL) ? { rejectUnauthorized: false } : false });
pool.query("SELECT to_regclass('public.salesperson_locations')")
.then(r => { console.log("Table check result: " + r.rows[0].to_regclass); pool.end(); })
.catch(e => { console.error(e); pool.end(); });
@
