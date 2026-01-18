// Seed Data Script
import pool from '../config/db.js';
import { hashPassword } from './password.js';

const seedData = async () => {
  try {
    console.log('🌱 Starting seed data...');

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

    // Create/Update salesperson user - Sales Person 1 (only one salesperson in system)
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

    console.log('✅ Seed data completed');
    console.log('📝 Default credentials:');
    console.log('   Admin: username=admin | password=admin123');
    console.log('   Sales Person 1: username=salesperson | password=salesperson123');
  } catch (error) {
    console.error('❌ Seed error:', error);
    throw error;
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  seedData()
    .then(() => {
      console.log('✅ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export default seedData;




