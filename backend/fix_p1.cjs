@
const { Pool } = require("pg"); require("dotenv").config();
const cs = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const pool = new Pool({ connectionString: cs, ssl: (process.env.NODE_ENV === "production") ? { rejectUnauthorized: false } : false });
pool.query(`CREATE TABLE IF NOT EXISTS salesperson_locations (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, latitude DECIMAL(10, 8) NOT NULL, longitude DECIMAL(11, 8) NOT NULL, accuracy DECIMAL(10, 2), last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id));`)
.then(() => { console.log("Part1 done"); process.exit(0); })
.catch(e => { console.error(e); process.exit(1); });
@
