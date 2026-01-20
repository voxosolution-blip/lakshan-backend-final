# How to Get DATABASE_URL from Railway (Windows)

Since you don't have `psql` installed locally, here's the easiest way to run your schema:

## Step 1: Get DATABASE_URL from Railway

1. Open https://railway.app/dashboard in your browser
2. Click on your project: **considerate-delight**
3. Click on your **PostgreSQL** service (should show "Postgres" or "PostgreSQL")
4. Click on the **"Variables"** tab
5. Look for **`DATABASE_URL`** in the list
6. Click on it or copy its value - it should look like:
   ```
   postgresql://postgres:password@host:port/database
   ```
7. **Copy this entire DATABASE_URL string** - you'll need it in Step 2

## Step 2: Use an Online PostgreSQL Client

### Option A: ElephantSQL Console (Easiest)

1. Go to: https://www.elephantsql.com/console.html
2. Look for "Connect to an external PostgreSQL server" or similar option
3. Use your `DATABASE_URL` from Railway to connect
4. Once connected, paste your schema.sql content and run it

### Option B: Supabase SQL Editor

1. Go to: https://supabase.com/dashboard (you don't need to sign up)
2. Look for their SQL editor tool
3. Use your `DATABASE_URL` connection string

### Option C: Use a Desktop Tool (if you install one)

- **DBeaver** (Free): https://dbeaver.io/download/
  - Install it
  - Create new connection → PostgreSQL
  - Use your `DATABASE_URL` connection details
  - Open `backend/database/schema.sql` and execute it

- **TablePlus** (Free tier): https://tableplus.com/
  - Similar to above

## Step 3: After Running Schema

Once the schema is run successfully:
1. Your Railway app will automatically detect the tables
2. The error "relation 'users' does not exist" will disappear
3. Visit your API: `https://your-app.up.railway.app/health/db` to verify

---

**TL;DR**: 
1. Get DATABASE_URL from Railway → PostgreSQL → Variables
2. Copy your schema.sql content
3. Use https://www.elephantsql.com/console.html to connect and run SQL
4. Done! 🎉







