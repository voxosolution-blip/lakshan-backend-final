# Quick Guide: Run Database Schema on Railway

Your app is working but needs the database schema. Follow these steps:

## ✅ Quick Solution

### Option 1: Railway CLI (Recommended - Fastest)

```bash
# 1. Install Railway CLI (one-time)
npm i -g @railway/cli

# 2. Login to Railway
railway login

# 3. Navigate to your project directory (where schema.sql is located)
cd path/to/your/project

# 4. Link to your Railway project
railway link

# 5. Run the schema (choose one method)

# Method A: Direct SQL file execution
railway connect postgres < backend/database/schema.sql

# Method B: Using psql via Railway shell
railway run psql $DATABASE_URL -f backend/database/schema.sql

# Method C: Using the script we provided
railway run bash backend/scripts/run-schema-railway.sh
```

### Option 2: Manual via Railway Web Interface

1. **Get Connection String:**
   - Go to Railway Dashboard → Your PostgreSQL Service
   - Click **"Variables"** tab
   - Copy the `DATABASE_URL` value

2. **Run Schema from Local Machine:**
   ```bash
   # Set DATABASE_URL (use the value from Railway)
   export DATABASE_URL="postgresql://user:password@host:port/database"
   
   # Run schema
   psql "$DATABASE_URL" -f backend/database/schema.sql
   ```

   Or if you have the connection details separately:
   ```bash
   psql -h HOST -p PORT -U USERNAME -d DATABASE_NAME -f backend/database/schema.sql
   ```

3. **Or Use a Database GUI Tool:**
   - Use DBeaver, pgAdmin, TablePlus, or any PostgreSQL client
   - Connect using the `DATABASE_URL` from Railway
   - Open `backend/database/schema.sql` and execute it

### Option 3: Copy-Paste Method

1. Open `schema.sql` from your GitHub repository:
   - https://github.com/voxosolution-blip/lakshan-backend-final/blob/main/backend/database/schema.sql

2. Click **"Raw"** button to view raw SQL

3. Copy all the SQL content

4. Connect to Railway PostgreSQL:
   - Use Railway CLI: `railway connect postgres`
   - Or use any PostgreSQL client with your `DATABASE_URL`

5. Paste and execute the SQL

## 🔍 Verify Schema Was Created

After running the schema, verify it worked:

```bash
# Connect to database
railway connect postgres

# List all tables
\dt

# You should see tables like: users, farmers, inventory_items, etc.
```

Or check via your API:
- Visit: `https://your-app.up.railway.app/health/db`
- Should return database info (not an error)

## 🚀 After Schema is Created

Your Railway app should automatically detect the schema and start working. You may see it restart automatically, or you can manually redeploy.

## 🎯 Optional: Seed Initial Data

To create default admin users:

```bash
# Using Railway shell
railway shell
cd backend
npm run seed
```

## ❓ Troubleshooting

### "command not found: railway"
- Install Railway CLI: `npm i -g @railway/cli`

### "DATABASE_URL not found"
- Make sure you're in a Railway environment or have set the variable manually
- Check Railway dashboard → PostgreSQL service → Variables tab

### "Permission denied" or connection errors
- Verify `DATABASE_URL` is correct
- Check PostgreSQL service is running in Railway
- Ensure SSL settings are correct (Railway uses SSL by default)

### Still seeing "schema not found" error?
- Verify schema ran successfully: `\dt` should show tables
- Check Railway logs to see if there are any SQL errors
- Redeploy your app after running schema

---

**Need help?** Check `RAILWAY_DEPLOYMENT.md` for more detailed instructions.

