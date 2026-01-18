// Main Server Entry Point
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
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

// Middleware - CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

// Add localhost for development if not in production
if (process.env.NODE_ENV !== 'production') {
  if (!allowedOrigins.includes('http://localhost:5173')) {
    allowedOrigins.push('http://localhost:5173');
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Check if origin matches Netlify pattern (for preview deployments)
      if (origin.includes('lakshanproducts01.netlify.app') || 
          origin.includes('netlify.app')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ERP API is running' });
});

// Database health check
app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: result.rows[0].time,
      users: parseInt(userCount.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// API Routes
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

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    console.log(`   Database time: ${result.rows[0].now}`);
    
    // Check if users table exists
    try {
      const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
      const count = parseInt(userCount.rows[0].count);
      console.log(`   Users in database: ${count}`);
      
      if (count === 0) {
        console.log('⚠️  No users found in database. Run: npm run seed');
      } else {
        // Check if default users exist
        const adminUser = await pool.query('SELECT username FROM users WHERE username = $1', ['admin']);
        const salesUser = await pool.query('SELECT username FROM users WHERE username IN ($1, $2) LIMIT 1', ['sales', 'salesperson']);
        
        if (adminUser.rows.length === 0 || salesUser.rows.length === 0) {
          console.log('⚠️  Default users (admin/salesperson) not found. Run: npm run seed');
        }
      }
    } catch (tableError) {
      if (tableError.message.includes('does not exist') || tableError.code === '42P01') {
        console.log('\n⚠️  Database schema not found!');
        console.log('   Attempting to create schema automatically...');
        
        try {
          // Read and execute schema file
          const schemaPath = join(__dirname, 'database', 'schema.sql');
          const schemaSQL = readFileSync(schemaPath, 'utf8');
          
          console.log('📋 Running database schema...');
          await pool.query(schemaSQL);
          
          console.log('✅ Database schema created successfully!');
          console.log('📊 Verifying tables...');
          
          // Verify tables were created
          const verifyResult = await pool.query('SELECT COUNT(*) as count FROM users');
          const count = parseInt(verifyResult.rows[0].count);
          console.log(`✅ Schema verified! Found ${count} users in database.`);
          console.log('🎉 Database is ready to use!\n');
          
        } catch (schemaError) {
          console.error('\n❌ Error creating schema automatically:', schemaError.message);
          console.error('\n💡 Manual fix required:');
          console.error('   1. Connect to your Railway PostgreSQL database');
          console.error('   2. Run the schema file: backend/database/schema.sql');
          console.error('   3. See RAILWAY_DEPLOYMENT.md for detailed instructions');
          console.error('\n   For Railway: Go to PostgreSQL service → Connect → Run schema.sql');
          process.exit(1);
        }
      } else {
        throw tableError;
      }
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('❌ Database connection failed:', error.message);
      console.error('\n💡 Troubleshooting:');
      if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
        console.error('   1. Check Railway PostgreSQL service is running');
        console.error('   2. Verify DATABASE_URL environment variable is set correctly');
        console.error('   3. Check your service Variables in Railway dashboard');
      } else {
        console.error('   1. Make sure Docker Desktop is running');
        console.error('   2. Check if PostgreSQL container is running: docker ps');
        console.error('   3. Start the container: docker-compose up -d postgres');
        console.error('   4. Verify port 5435 is accessible');
      }
    } else {
      console.error('❌ Database error:', error.message);
    }
    process.exit(1);
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 ERP Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  await testDatabaseConnection();
  
  // Initialize scheduled tasks
  initializeScheduledTasks();
});


