import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './src/config/db.js';
import { errorHandler } from './src/middlewares/error.middleware.js';
import authRoutes from './src/routes/auth.routes.js';
import farmerRoutes from './src/routes/farmer.routes.js';
import inventoryRoutes from './src/routes/inventory.routes.js';
import productionRoutes from './src/routes/production.routes.js';
import salesRoutes from './src/routes/sales.routes.js';
import paymentRoutes from './src/routes/payment.routes.js';
import returnsRoutes from './src/routes/returns.routes.js';
import expensesRoutes from './src/routes/expenses.routes.js';
import dashboardRoutes from './src/routes/dashboard.routes.js';
import productRoutes from './src/routes/product.routes.js';
import buyerRoutes from './src/routes/buyer.routes.js';
import settingsRoutes from './src/routes/settings.routes.js';
import salespersonRoutes from './src/routes/salesperson.routes.js';
import workerRoutes from './src/routes/worker.routes.js';
import reportsRoutes from './src/routes/reports.routes.js';
import adminRoutes from './src/routes/admin.routes.js';
import { initializeScheduledTasks } from './src/services/scheduledTasks.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/farmers', farmerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/buyers', buyerRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/salesperson', salespersonRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

async function ensureCriticalSchema() {
    console.log('  Running CRITICAL schema verification...');
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS settings (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            key VARCHAR(100) UNIQUE NOT NULL,
            value TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await pool.query(`INSERT INTO settings (key, value) VALUES 
            ('milk_price_per_liter', '100'),
            ('default_worker_daily_salary', '1500'),
            ('epf_percentage', '8'),
            ('etf_percentage', '3')
            ON CONFLICT (key) DO NOTHING`);
        await pool.query(`CREATE TABLE IF NOT EXISTS salesperson_locations (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            latitude DECIMAL(10, 8) NOT NULL,
            longitude DECIMAL(11, 8) NOT NULL,
            UNIQUE(user_id)
        )`);
        await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS free_quantity DECIMAL(10, 2) DEFAULT 0`);
        await pool.query(`ALTER TABLE productions ADD COLUMN IF NOT EXISTS batch VARCHAR(100)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS farmer_free_products (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            product_id UUID REFERENCES products(id),
            quantity DECIMAL(10, 2) NOT NULL,
            issued_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(farmer_id, year, month, product_id)
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS workers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT true
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS payroll (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            net_pay DECIMAL(10, 2) DEFAULT 0.00,
            UNIQUE(worker_id, year, month)
        )`);
        console.log(' Critical schema verified.');
    } catch (error) {
        console.error(' Schema verification failed:', error.message);
    }
}

app.listen(PORT, async () => {
    console.log(` ERP Server running on port ${PORT}`);
    try {
        await pool.query('SELECT NOW()');
        console.log(' Database connected');
        await ensureCriticalSchema();
        initializeScheduledTasks();
    } catch (err) {
        console.error(' Startup failed:', err.message);
    }
});
