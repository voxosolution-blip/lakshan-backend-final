-- Add settings table for milk price configuration
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Insert default milk price
INSERT INTO settings (key, value, description) 
VALUES ('milk_price_per_liter', '200', 'Default milk price per liter for all farmers')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE settings IS 'System settings and configuration values';





