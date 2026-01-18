-- ============================================
-- FARMER FREE PRODUCTS SYSTEM
-- ============================================

-- Farmer free products table (monthly free products given to farmers - reduces inventory)
CREATE TABLE IF NOT EXISTS farmer_free_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) DEFAULT 'piece',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(farmer_id, year, month, product_id)
);

CREATE INDEX idx_farmer_free_products_farmer ON farmer_free_products(farmer_id);
CREATE INDEX idx_farmer_free_products_month_year ON farmer_free_products(year, month);
CREATE INDEX idx_farmer_free_products_product ON farmer_free_products(product_id);

CREATE TRIGGER update_farmer_free_products_updated_at BEFORE UPDATE ON farmer_free_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE farmer_free_products IS 'Free products given to farmers monthly (reduces inventory)';

-- Add settings for default farmer free products (JSON format)
-- Example: [{"product_id": "uuid", "quantity": 20, "unit": "piece"}]
-- This will be stored in the settings table with key 'farmer_default_free_products'

