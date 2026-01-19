-- Create salesperson_locations table if it doesn't exist
CREATE TABLE IF NOT EXISTS salesperson_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(10, 2),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_salesperson_locations_user ON salesperson_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_salesperson_locations_updated ON salesperson_locations(last_updated);

-- Add is_reversed column to sales table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'sales' AND column_name = 'is_reversed') THEN
        ALTER TABLE sales ADD COLUMN is_reversed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add comments
COMMENT ON TABLE salesperson_locations IS 'Real-time location tracking for salespersons';
COMMENT ON COLUMN sales.is_reversed IS 'Indicates if this is a return/reversal sale';

-- Create extension if not exists for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
