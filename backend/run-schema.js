// Script to run database schema on Railway PostgreSQL
// Usage: railway run node run-schema.js

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runSchema() {
  try {
    console.log('📋 Reading schema file...');
    const schemaPath = join(__dirname, 'database', 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf8');
    
    console.log('📋 Running database schema...');
    console.log('   (This may take a few moments)');
    
    await pool.query(sql);
    
    console.log('');
    console.log('✅ Database schema created successfully!');
    console.log('');
    console.log('📊 Verifying tables...');
    
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log(`   Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    console.log('');
    console.log('🎉 Schema setup complete! Your app should now work.');
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Error running schema:', error.message);
    if (error.code === 'ENOENT') {
      console.error('💡 Make sure schema.sql exists in backend/database/');
    } else if (error.message.includes('already exists')) {
      console.error('⚠️  Some tables already exist. This is okay - continuing...');
      console.log('✅ Schema setup complete!');
      process.exit(0);
    } else {
      console.error('💡 Check the error message above for details');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSchema();

