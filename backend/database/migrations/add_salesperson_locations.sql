-- Add table for tracking salesperson locations
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

CREATE INDEX idx_salesperson_locations_user ON salesperson_locations(user_id);
CREATE INDEX idx_salesperson_locations_updated ON salesperson_locations(last_updated);

COMMENT ON TABLE salesperson_locations IS 'Real-time location tracking for salespersons';










