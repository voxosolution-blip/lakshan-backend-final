-- ============================================
-- FIX PRODUCTION ENDPOINTS - Missing Tables and Functions
-- This migration adds all required tables/columns for production endpoints
-- ============================================

-- 1. Add batch column to productions table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'productions' AND column_name = 'batch') THEN
        ALTER TABLE productions ADD COLUMN batch VARCHAR(100);
        CREATE INDEX IF NOT EXISTS idx_productions_batch ON productions(batch);
    END IF;
END $$;

-- 2. Create inventory_batches table for tracking finished goods with batch numbers
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

-- 3. Create salesperson_allocations table
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

-- 4. Ensure update_updated_at_column function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Add triggers for updated_at
DROP TRIGGER IF EXISTS update_inventory_batches_updated_at ON inventory_batches;
CREATE TRIGGER update_inventory_batches_updated_at 
    BEFORE UPDATE ON inventory_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_salesperson_allocations_updated_at ON salesperson_allocations;
CREATE TRIGGER update_salesperson_allocations_updated_at 
    BEFORE UPDATE ON salesperson_allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Create function to generate batch number (explicitly in public schema)
DROP FUNCTION IF EXISTS generate_batch_number(UUID, DATE);
CREATE OR REPLACE FUNCTION public.generate_batch_number(item_id UUID, prod_date DATE)
RETURNS VARCHAR(100) AS $$
DECLARE
    date_part VARCHAR(10);
    seq_num INTEGER;
    batch_num VARCHAR(100);
BEGIN
    date_part := TO_CHAR(prod_date, 'YYYY-MM-DD');
    
    -- Get the next sequence number for this date and item
    -- Check both inventory_batches and productions tables
    SELECT COALESCE(
        GREATEST(
            (SELECT MAX(CAST(SUBSTRING(batch_number FROM '[0-9]+$') AS INTEGER))
             FROM inventory_batches
             WHERE inventory_item_id = item_id
             AND production_date = prod_date),
            (SELECT MAX(CAST(SUBSTRING(batch FROM '[0-9]+$') AS INTEGER))
             FROM productions
             WHERE date = prod_date)
        ), 
        0
    ) + 1
    INTO seq_num;
    
    -- Format: YYYY-MM-DD-001, YYYY-MM-DD-002, etc.
    batch_num := date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    
    RETURN batch_num;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.generate_batch_number(UUID, DATE) TO PUBLIC;

-- 7. Ensure Finished Goods category exists
INSERT INTO inventory_categories (name, description)
SELECT 'Finished Goods', 'Finished products ready for sale'
WHERE NOT EXISTS (SELECT 1 FROM inventory_categories WHERE name = 'Finished Goods');

-- Done!
SELECT 'Migration completed: Production endpoints should now work' as status;

