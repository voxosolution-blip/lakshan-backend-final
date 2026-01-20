// Seed script specifically for Railway deployment
// This script will work when run in Railway's environment
import pool from './src/config/db.js';
import { hashPassword } from './src/utils/password.js';

const seedData = async () => {
  try {
    console.log('🌱 Starting seed data on Railway...');

    // Hash passwords
    const adminPassword = await hashPassword('admin123');
    const salesPassword = await hashPassword('salesperson123');

    // Create admin user
    const adminResult = await pool.query(
      `INSERT INTO users (username, password_hash, name, email, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           role = EXCLUDED.role
       RETURNING id`,
      ['admin', adminPassword, 'System Administrator', 'admin@yogurt.com', 'ADMIN']
    );

    // Create/Update salesperson user
    const salesResult = await pool.query(
      `INSERT INTO users (username, password_hash, name, email, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           is_active = true
       RETURNING id`,
      ['salesperson', salesPassword, 'Sales Person 1', 'salesperson@yogurt.com', 'SALESPERSON']
    );

    // Deactivate any other salespersons (keep only one active)
    await pool.query(
      `UPDATE users 
       SET is_active = false
       WHERE role = 'SALESPERSON' 
       AND username != 'salesperson'`
    );

    console.log('✅ Seed data completed successfully!');
    console.log('📝 Default credentials:');
    console.log('   Admin: username=admin | password=admin123');
    console.log('   Sales Person 1: username=salesperson | password=salesperson123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
};

seedData();






