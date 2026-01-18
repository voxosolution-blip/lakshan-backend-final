# PowerShell script to run schema on Railway PostgreSQL
# This script uses Railway CLI to execute SQL

Write-Host "📋 Running database schema on Railway PostgreSQL..." -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "backend/database/schema.sql")) {
    Write-Host "❌ Error: schema.sql not found in backend/database/" -ForegroundColor Red
    Write-Host "💡 Make sure you're in the project root directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found schema.sql file" -ForegroundColor Green
Write-Host ""

# Method 1: Try using railway run with node to read and execute SQL
Write-Host "Attempting to run schema via Railway..." -ForegroundColor Yellow
Write-Host ""

# Read the SQL file content
$sqlContent = Get-Content "backend/database/schema.sql" -Raw -Encoding UTF8

# Create a temporary Node.js script that will execute the SQL
$nodeScript = @"
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runSchema() {
  try {
    const sql = fs.readFileSync('backend/database/schema.sql', 'utf8');
    console.log('📋 Running schema...');
    await pool.query(sql);
    console.log('✅ Schema executed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSchema();
"@

# Save the script temporarily
$nodeScript | Out-File -FilePath "temp-run-schema.js" -Encoding UTF8

Write-Host "💡 Running schema via Railway environment..." -ForegroundColor Cyan
Write-Host ""

# Try to run via Railway
railway run node temp-run-schema.js

# Clean up
if (Test-Path "temp-run-schema.js") {
    Remove-Item "temp-run-schema.js"
}

Write-Host ""
Write-Host "💡 If that didn't work, try the manual method below:" -ForegroundColor Yellow



