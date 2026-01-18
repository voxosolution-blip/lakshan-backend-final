-- ============================================
-- YOGHURT FACTORY ERP - PostgreSQL Schema
-- Production-ready database design
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'SALESPERSON' CHECK (role IN ('ADMIN', 'SALESPERSON', 'ACCOUNTANT', 'PRODUCTION')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- FARMERS & MILK COLLECTION
-- ============================================

CREATE TABLE farmers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    milk_rate DECIMAL(10, 2) DEFAULT 0.00, -- Rate per liter
    allowance DECIMAL(10, 2) DEFAULT 0.00, -- Monthly allowance
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_farmers_active ON farmers(is_active);
CREATE INDEX idx_farmers_name ON farmers(name);

CREATE TABLE milk_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    time TIME DEFAULT CURRENT_TIME,
    quantity_liters DECIMAL(10, 2) NOT NULL CHECK (quantity_liters > 0),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_milk_collections_farmer ON milk_collections(farmer_id);
CREATE INDEX idx_milk_collections_date ON milk_collections(date);
CREATE INDEX idx_milk_collections_farmer_date ON milk_collections(farmer_id, date);

-- ============================================
-- INVENTORY MANAGEMENT
-- ============================================

CREATE TABLE inventory_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories
INSERT INTO inventory_categories (name, description) VALUES
    ('Raw Material', 'Raw materials like milk, sugar, etc.'),
    ('Packaging', 'Packaging materials'),
    ('Finished Goods', 'Finished products ready for sale'),
    ('Utilities', 'Utilities and consumables');

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category_id UUID NOT NULL REFERENCES inventory_categories(id),
    unit VARCHAR(50) NOT NULL DEFAULT 'liter',
    quantity DECIMAL(10, 2) DEFAULT 0.00 CHECK (quantity >= 0),
    min_quantity DECIMAL(10, 2) DEFAULT 0.00,
    expiry_date DATE,
    price DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_category ON inventory_items(category_id);
CREATE INDEX idx_inventory_low_stock ON inventory_items(quantity, min_quantity);
CREATE INDEX idx_inventory_expiry ON inventory_items(expiry_date) WHERE expiry_date IS NOT NULL;

-- ============================================
-- PRODUCTS & BOM (Bill of Materials)
-- ============================================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    selling_price DECIMAL(10, 2) NOT NULL CHECK (selling_price >= 0),
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_category ON products(category);

CREATE TABLE product_bom (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required DECIMAL(10, 2) NOT NULL CHECK (quantity_required > 0),
    unit VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, inventory_item_id)
);

CREATE INDEX idx_bom_product ON product_bom(product_id);
CREATE INDEX idx_bom_inventory ON product_bom(inventory_item_id);

-- ============================================
-- PRODUCTION
-- ============================================

CREATE TABLE productions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity_produced DECIMAL(10, 2) NOT NULL CHECK (quantity_produced > 0),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_productions_date ON productions(date);
CREATE INDEX idx_productions_product ON productions(product_id);
CREATE INDEX idx_productions_date_product ON productions(date, product_id);

-- ============================================
-- BUYERS & SALES
-- ============================================

CREATE TABLE buyers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name VARCHAR(255) NOT NULL,
    contact VARCHAR(20),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_buyers_active ON buyers(is_active);

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id UUID REFERENCES buyers(id),
    salesperson_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sales_buyer ON sales(buyer_id);
CREATE INDEX idx_sales_salesperson ON sales(salesperson_id);
CREATE INDEX idx_sales_date ON sales(date);
CREATE INDEX idx_sales_payment_status ON sales(payment_status);

CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * price) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- ============================================
-- PAYMENTS & CHEQUES
-- ============================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    cash_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (cash_amount >= 0),
    cheque_amount DECIMAL(10, 2) DEFAULT 0.00 CHECK (cheque_amount >= 0),
    total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (cash_amount + cheque_amount) STORED,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    payment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_sale ON payments(sale_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(payment_date);

CREATE TABLE cheques (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    cheque_number VARCHAR(100),
    bank_name VARCHAR(255),
    cheque_date DATE NOT NULL,
    return_date DATE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'cleared', 'bounced', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cheques_payment ON cheques(payment_id);
CREATE INDEX idx_cheques_status ON cheques(status);
CREATE INDEX idx_cheques_date ON cheques(cheque_date);
CREATE INDEX idx_cheques_return_date ON cheques(return_date);

-- ============================================
-- RETURNS & REPLACEMENTS
-- ============================================

CREATE TABLE returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    reason TEXT,
    replacement_given BOOLEAN DEFAULT false,
    replacement_product_id UUID REFERENCES products(id),
    replacement_quantity DECIMAL(10, 2),
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_returns_sale ON returns(sale_id);
CREATE INDEX idx_returns_product ON returns(product_id);
CREATE INDEX idx_returns_date ON returns(created_at);

-- ============================================
-- EXPENSES
-- ============================================

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    category VARCHAR(100), -- e.g., 'operational', 'maintenance', 'utilities'
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_type ON expenses(type);
CREATE INDEX idx_expenses_category ON expenses(category);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_farmers_updated_at BEFORE UPDATE ON farmers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cheques_updated_at BEFORE UPDATE ON cheques
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON returns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- View for low stock alerts
CREATE OR REPLACE VIEW v_low_stock_alerts AS
SELECT 
    i.id,
    i.name,
    i.category_id,
    c.name as category_name,
    i.quantity,
    i.min_quantity,
    i.unit,
    (i.min_quantity - i.quantity) as shortage
FROM inventory_items i
JOIN inventory_categories c ON i.category_id = c.id
WHERE i.quantity < i.min_quantity AND i.min_quantity > 0;

-- View for expiry alerts (items expiring in next 7 days)
CREATE OR REPLACE VIEW v_expiry_alerts AS
SELECT 
    i.id,
    i.name,
    i.category_id,
    c.name as category_name,
    i.quantity,
    i.expiry_date,
    (i.expiry_date - CURRENT_DATE) as days_until_expiry
FROM inventory_items i
JOIN inventory_categories c ON i.category_id = c.id
WHERE i.expiry_date IS NOT NULL 
    AND i.expiry_date >= CURRENT_DATE 
    AND i.expiry_date <= CURRENT_DATE + INTERVAL '7 days';

-- View for daily sales summary
CREATE OR REPLACE VIEW v_daily_sales_summary AS
SELECT 
    s.date,
    COUNT(DISTINCT s.id) as total_sales,
    COUNT(DISTINCT s.buyer_id) as unique_buyers,
    SUM(s.total_amount) as total_revenue,
    SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END) as paid_amount,
    SUM(CASE WHEN s.payment_status = 'pending' THEN s.total_amount ELSE 0 END) as pending_amount
FROM sales s
GROUP BY s.date;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE users IS 'System users with role-based access';
COMMENT ON TABLE farmers IS 'Milk suppliers/farmers';
COMMENT ON TABLE milk_collections IS 'Daily milk collection records - auto-adds to inventory';
COMMENT ON TABLE inventory_items IS 'All inventory items (raw materials, packaging, finished goods)';
COMMENT ON TABLE products IS 'Finished products for sale';
COMMENT ON TABLE product_bom IS 'Bill of Materials - recipe for each product';
COMMENT ON TABLE productions IS 'Production records - auto-deducts inventory, adds finished goods';
COMMENT ON TABLE buyers IS 'Customers/shops that buy products';
COMMENT ON TABLE sales IS 'Sales transactions';
COMMENT ON TABLE payments IS 'Payment records for sales';
COMMENT ON TABLE cheques IS 'Cheque payment details';
COMMENT ON TABLE returns IS 'Product returns and replacements';
COMMENT ON TABLE expenses IS 'Operational expenses';











