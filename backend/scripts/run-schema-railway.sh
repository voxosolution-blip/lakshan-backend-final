#!/bin/bash
# Script to run database schema on Railway PostgreSQL
# Usage: railway connect postgres < backend/database/schema.sql
# Or: railway run bash -c "cat backend/database/schema.sql | psql \$DATABASE_URL"

echo "📋 Running database schema on Railway PostgreSQL..."
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "💡 Make sure you're running this in Railway environment or set DATABASE_URL"
    exit 1
fi

# Run the schema
if psql "$DATABASE_URL" -f backend/database/schema.sql; then
    echo ""
    echo "✅ Database schema created successfully!"
    echo "📊 Verifying tables..."
    psql "$DATABASE_URL" -c "\dt" | head -20
    echo ""
    echo "🎉 Schema setup complete!"
else
    echo ""
    echo "❌ Error running schema"
    exit 1
fi


