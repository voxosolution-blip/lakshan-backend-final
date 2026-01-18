-- ============================================
-- INVENTORY BATCH TRACKING & ALLOCATION SYSTEM
-- ============================================

-- Update categories to match requirements
UPDATE inventory_categories SET name = 'Packaging Materials', description = 'Packaging materials like cups, bottles, packets' WHERE name = 'Packaging';
UPDATE inventory_categories SET name = 'Raw Materials', description = 'Raw materials including milk, sugar, starter culture, etc.' WHERE name = 'Raw Material';
UPDATE inventory_categories SET name = 'Finished Goods', description = 'Finished products ready for sale' WHERE name = 'Finished Goods';
UPDATE inventory_categories SET name = 'Utilities & Energy', description = 'Utilities and energy consumables' WHERE name = 'Utilities';

-- Add batch column to productions table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'productions' AND column_name = 'batch') THEN
        ALTER TABLE productions ADD COLUMN batch VARCHAR(100);
    END IF;
END $$;

-- Create inventory_batches table for tracking finished goods with batch numbers
CREATE TABLE IF NOT EXISTS inventory_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    production_id UUID REFERENCES productions(id),
    batch_number VARCHAR(100) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    production_date DATE NOT NULL,
    expiry_date DATE,
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'allocated', 'sold', 'expired')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(inventory_item_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_item ON inventory_batches(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_production ON inventory_batches(production_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_batch_number ON inventory_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_status ON inventory_batches(status);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_date ON inventory_batches(production_date);

-- Create salesperson_allocations table
CREATE TABLE IF NOT EXISTS salesperson_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    salesperson_id UUID NOT NULL REFERENCES users(id),
    batch_number VARCHAR(100) NOT NULL,
    quantity_allocated DECIMAL(10, 2) NOT NULL CHECK (quantity_allocated > 0),
    allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'returned', 'cancelled')),
    notes TEXT,
    allocated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_allocations_production ON salesperson_allocations(production_id);
CREATE INDEX IF NOT EXISTS idx_allocations_product ON salesperson_allocations(product_id);
CREATE INDEX IF NOT EXISTS idx_allocations_salesperson ON salesperson_allocations(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_allocations_date ON salesperson_allocations(allocation_date);
CREATE INDEX IF NOT EXISTS idx_allocations_status ON salesperson_allocations(status);

-- Add trigger for updated_at
CREATE TRIGGER update_inventory_batches_updated_at BEFORE UPDATE ON inventory_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_salesperson_allocations_updated_at BEFORE UPDATE ON salesperson_allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate batch number (format: YYYY-MM-DD-XXX where XXX is sequential number for that date)
CREATE OR REPLACE FUNCTION generate_batch_number(item_id UUID, prod_date DATE)
RETURNS VARCHAR(100) AS $$
DECLARE
    year_part VARCHAR(4);
    date_part VARCHAR(10);
    seq_num INTEGER;
    batch_num VARCHAR(100);
BEGIN
    year_part := TO_CHAR(prod_date, 'YYYY');
    date_part := TO_CHAR(prod_date, 'YYYY-MM-DD');
    
    -- Get the next sequence number for this date and item
    SELECT COALESCE(MAX(CAST(SUBSTRING(batch_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM inventory_batches
    WHERE inventory_item_id = item_id
    AND production_date = prod_date;
    
    -- Format: YYYY-MM-DD-001, YYYY-MM-DD-002, etc.
    batch_num := date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    
    RETURN batch_num;
END;
$$ LANGUAGE plpgsql;

-- Create default inventory items for packaging materials
INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Yogurt Cups',
    (SELECT id FROM inventory_categories WHERE name = 'Packaging Materials'),
    'piece',
    0,
    1000
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Yogurt Cups');

INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Yogurt Drink Bottles',
    (SELECT id FROM inventory_categories WHERE name = 'Packaging Materials'),
    'piece',
    0,
    1000
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Yogurt Drink Bottles');

INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Ice Packets',
    (SELECT id FROM inventory_categories WHERE name = 'Packaging Materials'),
    'piece',
    0,
    1000
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Ice Packets');

-- Create default inventory items for raw materials (milk will be auto-added from collections)
INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Milk',
    (SELECT id FROM inventory_categories WHERE name = 'Raw Materials'),
    'liter',
    0,
    100
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Milk');

INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Starter Culture',
    (SELECT id FROM inventory_categories WHERE name = 'Raw Materials'),
    'kg',
    0,
    5
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Starter Culture');

INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Sugar',
    (SELECT id FROM inventory_categories WHERE name = 'Raw Materials'),
    'kg',
    0,
    50
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Sugar');

INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Milk Powder',
    (SELECT id FROM inventory_categories WHERE name = 'Raw Materials'),
    'kg',
    0,
    20
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Milk Powder');

INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Stabilizer',
    (SELECT id FROM inventory_categories WHERE name = 'Raw Materials'),
    'kg',
    0,
    10
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Stabilizer');

INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
SELECT 
    'Flavors',
    (SELECT id FROM inventory_categories WHERE name = 'Raw Materials'),
    'kg',
    0,
    5
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Flavors');

-- View for daily production summary with allocations
CREATE OR REPLACE VIEW v_daily_production_summary AS
SELECT 
    p.id as production_id,
    p.date as production_date,
    p.batch,
    pr.id as product_id,
    pr.name as product_name,
    p.quantity_produced,
    COALESCE(SUM(sa.quantity_allocated), 0) as total_allocated,
    (p.quantity_produced - COALESCE(SUM(sa.quantity_allocated), 0)) as remaining_quantity,
    COUNT(DISTINCT sa.salesperson_id) as salesperson_count
FROM productions p
JOIN products pr ON p.product_id = pr.id
LEFT JOIN salesperson_allocations sa ON p.id = sa.production_id AND sa.status = 'active'
GROUP BY p.id, p.date, p.batch, pr.id, pr.name, p.quantity_produced;

-- View for salesperson inventory (only allocated items)
CREATE OR REPLACE VIEW v_salesperson_inventory AS
SELECT 
    sa.id as allocation_id,
    sa.salesperson_id,
    u.name as salesperson_name,
    sa.product_id,
    pr.name as product_name,
    sa.batch_number,
    sa.quantity_allocated,
    sa.allocation_date,
    sa.status,
    p.date as production_date,
    p.batch as production_batch
FROM salesperson_allocations sa
JOIN users u ON sa.salesperson_id = u.id
JOIN products pr ON sa.product_id = pr.id
JOIN productions p ON sa.production_id = p.id
WHERE sa.status = 'active';

COMMENT ON TABLE inventory_batches IS 'Tracks finished goods inventory with batch numbers for traceability';
COMMENT ON TABLE salesperson_allocations IS 'Tracks products allocated to salespersons from daily production';
COMMENT ON FUNCTION generate_batch_number IS 'Generates unique batch numbers in format YYYY-MM-DD-XXX';

