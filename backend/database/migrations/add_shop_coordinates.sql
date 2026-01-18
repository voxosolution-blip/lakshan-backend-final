-- Add latitude and longitude fields to buyers table for shop location mapping
ALTER TABLE buyers 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

CREATE INDEX IF NOT EXISTS idx_buyers_coordinates ON buyers(latitude, longitude);

COMMENT ON COLUMN buyers.latitude IS 'Shop location latitude for map display';
COMMENT ON COLUMN buyers.longitude IS 'Shop location longitude for map display';




