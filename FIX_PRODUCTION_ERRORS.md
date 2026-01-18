# Fix Production Endpoints 500 Errors

The 500 errors on production endpoints are caused by missing database tables. The following tables/functions need to be created:

## Missing Components:
- `batch` column in `productions` table
- `inventory_batches` table
- `salesperson_allocations` table  
- `generate_batch_number()` function

## Solution: Run Migration Script

### Method 1: Using Railway Dashboard (Easiest)

1. Go to your Railway PostgreSQL service
2. Click on **"Connect"** or **"Query"** tab
3. Copy the contents of `backend/database/migrations/fix_production_endpoints.sql`
4. Paste and execute the SQL in the query editor
5. You should see: `Migration completed: Production endpoints should now work`

### Method 2: Using Railway CLI

```bash
# Link to your project
railway link

# Connect to PostgreSQL and run migration
railway connect postgres < backend/database/migrations/fix_production_endpoints.sql
```

### Method 3: Using psql from local machine

1. Get `DATABASE_URL` from Railway PostgreSQL service → Variables tab
2. Run:
```bash
psql $DATABASE_URL -f backend/database/migrations/fix_production_endpoints.sql
```

## After Running Migration

Once the migration is complete:
1. Refresh your frontend application
2. The production endpoints should now work:
   - `GET /api/production` ✅
   - `GET /api/production/today/allocations` ✅
   - `GET /api/production/allocations` ✅
   - `POST /api/production` ✅

## Verify Migration Success

You can verify the tables were created by running this query in Railway:

```sql
SELECT 
    'batch column' as check_item,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'productions' AND column_name = 'batch'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
UNION ALL
SELECT 
    'inventory_batches table',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'inventory_batches'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING' END
UNION ALL
SELECT 
    'salesperson_allocations table',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'salesperson_allocations'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING' END
UNION ALL
SELECT 
    'generate_batch_number function',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'generate_batch_number'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING' END;
```

All should show "✓ EXISTS" if the migration was successful.

