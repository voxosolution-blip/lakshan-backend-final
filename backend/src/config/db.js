// Database Configuration
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Railway provides DATABASE_URL automatically, but we can also use individual variables
let poolConfig;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL if provided (Railway, Heroku, etc.)
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
} else {
  // Use individual environment variables or defaults (for local development)
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5435', 10),
    database: process.env.DB_NAME || 'yogurt_erp',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(poolConfig);

// Test connection
pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err.message);
  if (err.code === 'ECONNREFUSED') {
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure Docker Desktop is running');
    console.error('   2. Check if PostgreSQL container is running: docker ps');
    console.error('   3. Start the container: docker-compose up -d postgres');
    console.error('   4. Or use: npm run start:docker (auto-starts Docker)\n');
  }
});

export default pool;


