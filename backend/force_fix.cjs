@
const { Pool } = require("pg"); require("dotenv").config();
const cs = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
const pool = new Pool({ connectionString: cs, ssl: (process.env.NODE_ENV === "production" || process.env.DATABASE_PUBLIC_URL) ? { rejectUnauthorized: false } : false });

async function run() {
    console.log("Forcing Schema Update...");
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS salesperson_locations (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, latitude DECIMAL(10, 8) NOT NULL, longitude DECIMAL(11, 8) NOT NULL, accuracy DECIMAL(10, 2), last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id));`);
        console.log("- salesperson_locations created");
        
        await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'is_reversed') THEN ALTER TABLE sales ADD COLUMN is_reversed BOOLEAN DEFAULT false; END IF; END $$;`);
        console.log("- is_reversed added");

        await pool.query(`CREATE TABLE IF NOT EXISTS salesperson_allocations (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id), salesperson_id UUID NOT NULL REFERENCES users(id), batch_number VARCHAR(100) NOT NULL, quantity_allocated DECIMAL(10, 2) NOT NULL CHECK (quantity_allocated > 0), allocation_date DATE NOT NULL DEFAULT CURRENT_DATE, status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'returned', 'cancelled')), notes TEXT, allocated_by UUID REFERENCES users(id), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        console.log("- salesperson_allocations created");

        console.log("Done.");
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
@
