-- ============================================
-- WORKERS & SALARY SYSTEM
-- ============================================

-- Workers table
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    epf_number VARCHAR(50),
    etf_number VARCHAR(50),
    main_salary DECIMAL(10, 2) DEFAULT 0.00 NOT NULL,
    monthly_bonus DECIMAL(10, 2) DEFAULT 0.00,
    late_hour_rate DECIMAL(10, 2) DEFAULT 0.00, -- Rate per hour for overtime
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workers_active ON workers(is_active);
CREATE INDEX idx_workers_name ON workers(name);

-- Worker attendance table (tracks daily attendance)
CREATE TABLE IF NOT EXISTS worker_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    present BOOLEAN DEFAULT true,
    late_hours DECIMAL(4, 2) DEFAULT 0.00, -- Overtime/late hours worked
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(worker_id, date)
);

CREATE INDEX idx_worker_attendance_worker ON worker_attendance(worker_id);
CREATE INDEX idx_worker_attendance_date ON worker_attendance(date);
CREATE INDEX idx_worker_attendance_worker_date ON worker_attendance(worker_id, date);

-- Worker advance payments (advance salary paid before month end)
CREATE TABLE IF NOT EXISTS worker_advances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_worker_advances_worker ON worker_advances(worker_id);
CREATE INDEX idx_worker_advances_month_year ON worker_advances(year, month);
CREATE INDEX idx_worker_advances_worker_month_year ON worker_advances(worker_id, year, month);

-- Worker free products (monthly free products given to workers - reduces inventory)
CREATE TABLE IF NOT EXISTS worker_free_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) DEFAULT 'piece',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (inventory_item_id IS NOT NULL AND product_id IS NULL) OR
        (inventory_item_id IS NULL AND product_id IS NOT NULL)
    )
);

CREATE INDEX idx_worker_free_products_worker ON worker_free_products(worker_id);
CREATE INDEX idx_worker_free_products_month_year ON worker_free_products(year, month);
CREATE INDEX idx_worker_free_products_inventory ON worker_free_products(inventory_item_id);
CREATE INDEX idx_worker_free_products_product ON worker_free_products(product_id);

-- Worker salary payments (monthly salary records)
CREATE TABLE IF NOT EXISTS worker_salary_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    days_present INTEGER DEFAULT 0,
    main_salary DECIMAL(10, 2) DEFAULT 0.00,
    monthly_bonus DECIMAL(10, 2) DEFAULT 0.00,
    late_hour_salary DECIMAL(10, 2) DEFAULT 0.00, -- Total overtime pay
    advance_amount DECIMAL(10, 2) DEFAULT 0.00, -- Total advances for this month
    net_pay DECIMAL(10, 2) DEFAULT 0.00, -- (main_salary + bonus + late_hour_salary) - advance_amount
    payment_date DATE,
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    UNIQUE(worker_id, year, month)
);

CREATE INDEX idx_worker_salary_payments_worker ON worker_salary_payments(worker_id);
CREATE INDEX idx_worker_salary_payments_month_year ON worker_salary_payments(year, month);
CREATE INDEX idx_worker_salary_payments_status ON worker_salary_payments(payment_status);

-- Add updated_at trigger for workers table
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_attendance_updated_at BEFORE UPDATE ON worker_attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_advances_updated_at BEFORE UPDATE ON worker_advances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_free_products_updated_at BEFORE UPDATE ON worker_free_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_salary_payments_updated_at BEFORE UPDATE ON worker_salary_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE workers IS 'Worker/Employee records with salary information';
COMMENT ON TABLE worker_attendance IS 'Daily attendance tracking for workers';
COMMENT ON TABLE worker_advances IS 'Advance salary payments made to workers before month end';
COMMENT ON TABLE worker_free_products IS 'Free products given to workers monthly (reduces inventory)';
COMMENT ON TABLE worker_salary_payments IS 'Monthly salary payment records for workers';

