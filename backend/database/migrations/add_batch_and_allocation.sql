-- Add batch field to productions table
ALTER TABLE productions ADD COLUMN IF NOT EXISTS batch VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_productions_batch ON productions(batch);

-- Add sales allocation table
CREATE TABLE IF NOT EXISTS sales_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity_allocated DECIMAL(10, 2) NOT NULL CHECK (quantity_allocated > 0),
    allocated_to UUID REFERENCES users(id), -- Sales person
    allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'allocated' CHECK (status IN ('allocated', 'sold', 'returned')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_allocations_production ON sales_allocations(production_id);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_product ON sales_allocations(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_date ON sales_allocations(allocation_date);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_status ON sales_allocations(status);

COMMENT ON TABLE sales_allocations IS 'Track product allocation from production to sales persons';










