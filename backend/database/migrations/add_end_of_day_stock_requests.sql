-- Add end-of-day stock update requests table
CREATE TABLE IF NOT EXISTS end_of_day_stock_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salesperson_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(salesperson_id, request_date)
);

CREATE INDEX idx_eod_requests_salesperson ON end_of_day_stock_requests(salesperson_id);
CREATE INDEX idx_eod_requests_date ON end_of_day_stock_requests(request_date);
CREATE INDEX idx_eod_requests_status ON end_of_day_stock_requests(status);

-- Table to store the stock items in each request
CREATE TABLE IF NOT EXISTS end_of_day_stock_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES end_of_day_stock_requests(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    remaining_quantity DECIMAL(10, 2) NOT NULL CHECK (remaining_quantity >= 0),
    unit VARCHAR(50) NOT NULL DEFAULT 'piece',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_eod_items_request ON end_of_day_stock_items(request_id);
CREATE INDEX idx_eod_items_product ON end_of_day_stock_items(product_id);

COMMENT ON TABLE end_of_day_stock_requests IS 'Stores salesperson requests to update remaining stock to main inventory at end of day';
COMMENT ON TABLE end_of_day_stock_items IS 'Stores the remaining stock items for each end-of-day request';


