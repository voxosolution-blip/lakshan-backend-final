# Railway Deployment Guide for Yogurt ERP Backend

This guide will walk you through deploying your backend to Railway step-by-step.

## Prerequisites

1. A Railway account (sign up at https://railway.app)
2. Your GitHub repository pushed (already done ✅)

---

## Step 1: Create a New Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"** button
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account if prompted
5. Select the repository: **`voxosolution-blip/lakshan-backend-final`**
6. Railway will start importing your repository

---

## Step 2: Configure Project Settings

### 2.1 Fix "Railpack could not determine how to build" Error

If you see the error "Railpack could not determine how to build the app", **you have two options**:

#### Option A: Use Configuration Files (RECOMMENDED - Already Done ✅)

The repository now includes:
- `nixpacks.toml` - Tells Railway how to build from the `backend` folder
- `railway.json` - Railway-specific configuration

**These files are already pushed to GitHub**, so Railway should automatically detect them on the next deployment. If you still see the error:

1. In Railway dashboard → Go to your service
2. Click **"Deployments"** tab
3. Click **"Redeploy"** to trigger a new build with the config files

#### Option B: Set Root Directory in Dashboard

1. Click on your new project in Railway
2. Click on the service (or create one if not auto-created)
3. Go to **Settings** tab
4. Scroll to **"Root Directory"**
5. Set it to: `backend`
6. Click **"Save"**

### 2.2 Verify Build Configuration

Railway will use the `nixpacks.toml` configuration, but you can verify:

1. In **Settings** tab
2. **Build Command** should be: `cd backend && npm install` (from nixpacks.toml)
3. **Start Command** should be: `cd backend && npm start` (from nixpacks.toml)

---

## Step 3: Set Up PostgreSQL Database

### 3.1 Create PostgreSQL Service

1. In your Railway project dashboard
2. Click **"+ New"** button
3. Select **"Database"** → **"Add PostgreSQL"**
4. Railway will create a new PostgreSQL database service

### 3.2 Get Database Connection Variables

1. Click on the **PostgreSQL** service
2. Go to **"Variables"** tab
3. You'll see these variables (Railway automatically creates them):
   - `PGHOST`
   - `PGPORT`
   - `PGDATABASE`
   - `PGUSER`
   - `PGPASSWORD`

---

## Step 4: Configure Environment Variables

### 4.1 Connect Database to Your App (IMPORTANT!)

Railway automatically provides a `DATABASE_URL` environment variable when you create a PostgreSQL service. **Your app now supports this automatically!**

#### Option A: Use DATABASE_URL (RECOMMENDED - Easiest)

1. Go to your **backend service** (not the database)
2. Click on **"Variables"** tab
3. Railway **automatically** provides `DATABASE_URL` from the PostgreSQL service
4. Click **"Reference Variable"** → Select `DATABASE_URL` from your PostgreSQL service
   - Variable: `DATABASE_URL` → Reference: `${{Postgres.DATABASE_URL}}`
   
   *(Replace `Postgres` with your actual PostgreSQL service name if different)*

**That's it!** Your app will automatically use `DATABASE_URL` for the database connection.

#### Option B: Use Individual Database Variables (Alternative)

If you prefer using individual variables:

1. Go to your **backend service** → **"Variables"** tab
2. Add these by clicking **"Reference Variable"**:

   - Variable: `DB_HOST` → Reference: `${{Postgres.PGHOST}}`
   - Variable: `DB_PORT` → Reference: `${{Postgres.PGPORT}}`
   - Variable: `DB_NAME` → Reference: `${{Postgres.PGDATABASE}}`
   - Variable: `DB_USER` → Reference: `${{Postgres.PGUSER}}`
   - Variable: `DB_PASSWORD` → Reference: `${{Postgres.PGPASSWORD}}`

### 4.2 Add Other Required Environment Variables

Add these manually:

1. `PORT` = `5000` (Railway will override with its own PORT, but this is a fallback)
2. `NODE_ENV` = `production`
3. `CORS_ORIGIN` = `https://your-frontend-domain.com` (replace with your frontend URL)
4. `JWT_SECRET` = `your-super-secret-jwt-key-here` (generate a strong random string)
5. `JWT_EXPIRES_IN` = `24h` (or your preferred expiration time)

**To generate a JWT_SECRET:**
- You can use: `openssl rand -base64 32` (in terminal)
- Or use an online generator like: https://generate-secret.vercel.app/32

---

## Step 5: Deploy and Verify

### 5.1 Deploy

1. Railway will automatically start deploying when you save settings
2. Go to **"Deployments"** tab to watch the build progress
3. Wait for deployment to complete (usually 2-5 minutes)

### 5.2 Get Your App URL

1. After deployment, go to **"Settings"** tab
2. Scroll to **"Domains"** section
3. Railway provides a default domain like: `your-app-name.up.railway.app`
4. Copy this URL - this is your API endpoint!

### 5.3 Test Your Deployment

1. Open your Railway-provided URL in a browser: `https://your-app-name.up.railway.app/health`
2. You should see: `{"status":"ok","message":"ERP API is running"}`
3. Test database connection: `https://your-app-name.up.railway.app/health/db`

---

## Step 6: Set Up Database Schema ⚠️ REQUIRED!

**You MUST run the database schema before your app will work!** If you see errors like `relation "users" does not exist`, you need to complete this step.

### 6.1 Connect to Railway PostgreSQL

You have three options:

**Option A: Using Railway's Web-Based Query Tool (Easiest)**
1. Go to your **PostgreSQL service** in Railway dashboard
2. Click on the **"Query"** or **"Data"** tab (if available)
3. Or click **"Connect"** → This will show connection details
4. Railway may provide a web-based query interface - use that if available

**Option B: Using Railway CLI (Recommended for larger schemas)**
1. Install Railway CLI: `npm i -g @railway/cli` or visit https://railway.app/cli
2. Login: `railway login`
3. Link your project: `railway link`
4. Get database connection: `railway connect postgres`
5. This will open a psql session connected to your Railway database

**Option C: Using psql from your local machine**
1. Go to your PostgreSQL service → **Variables** tab
2. Copy the `DATABASE_URL` or individual connection variables
3. Use psql to connect:
   ```bash
   # If you have DATABASE_URL
   psql $DATABASE_URL
   
   # Or using individual variables
   psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE
   ```

### 6.2 Run Database Schema

**Method 1: Using Railway CLI (Easiest)**
```bash
# If you have Railway CLI installed
railway connect postgres < backend/database/schema.sql
```

**Method 2: Copy-Paste the Schema**
1. Open `backend/database/schema.sql` file (in your local project or on GitHub)
2. Copy the entire contents
3. Connect to Railway PostgreSQL (using any method from 6.1)
4. Paste and execute the SQL

**Method 3: Using psql from local machine**
```bash
# Get DATABASE_URL from Railway PostgreSQL service → Variables tab
# Then run:
psql $DATABASE_URL -f backend/database/schema.sql
```

### 6.3 Verify Schema Was Created

After running the schema, verify it worked:

1. Connect to your Railway PostgreSQL database
2. Run: `\dt` (in psql) to list all tables
3. You should see tables like: `users`, `farmers`, `inventory_items`, etc.

Or test via your API:
- Visit: `https://your-app.up.railway.app/health/db`
- Should return database connection info (not an error)

### 6.4 Seed Initial Data (Optional but Recommended)

To create default admin and salesperson users:

**Option A: Using Railway Shell**
1. Go to your **backend service** → **Settings** → **Shell**
2. Or use Railway CLI: `railway shell`
3. Run: `npm run seed`

**Option B: Manual Insert**
You can manually insert users via the database connection if the seed script is not available.

**Default login credentials** (after seeding):
- Admin: `admin` / password set in seed script
- Salesperson: `salesperson` / password set in seed script

---

## Step 7: Configure Custom Domain (Optional)

1. Go to your backend service → **Settings** → **Domains**
2. Click **"Generate Domain"** if not already generated
3. Or **"Custom Domain"** to add your own domain
4. Follow Railway's DNS configuration instructions

---

## Step 8: Monitor and Manage

### Useful Railway Features:

1. **Logs**: Click on service → **"Deployments"** → Click on a deployment → View logs
2. **Metrics**: Monitor CPU, Memory, Network usage
3. **Redeploy**: Click **"Redeploy"** button to restart
4. **Environment Variables**: Always update here, Railway will auto-redeploy

---

## Troubleshooting

### Build Fails
- Check **Deployments** tab → Click on failed deployment → View logs
- Common issues:
  - Missing `package.json` in root (but it's in `backend/` - set Root Directory!)
  - Build command errors - check Node.js version

### Database Connection Errors (ECONNREFUSED)

If you see `❌ Database connection failed: connect ECONNREFUSED ::1:5435`:

**This means the app is trying to connect to localhost instead of Railway's PostgreSQL.**

**Solution:**
1. Go to your **backend service** → **Variables** tab
2. Make sure `DATABASE_URL` is set and references your PostgreSQL service:
   - Variable: `DATABASE_URL` → Reference: `${{Postgres.DATABASE_URL}}`
3. OR set individual database variables:
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
4. Verify PostgreSQL service is running (check the service status)
5. Make sure variable references use the correct service name (case-sensitive)
6. Click **"Redeploy"** after adding variables

### Port Issues
- Railway sets `PORT` automatically - don't override it
- Your code uses `process.env.PORT || 5000` which is correct ✅

### "relation does not exist" Error

If you see `❌ Database connection failed: relation "users" does not exist`:

**This means the database schema has not been run yet!**

**Solution:**
1. Go to **Step 6** in this guide
2. Connect to your Railway PostgreSQL database
3. Run the schema file: `backend/database/schema.sql`
4. Redeploy your app after running the schema

### Application Crashes
- Check **Logs** in Railway dashboard
- Verify all required environment variables are set
- Check database schema is initialized (see "relation does not exist" error above)

---

## Quick Reference

**Railway Dashboard**: https://railway.app/dashboard  
**Your Repository**: https://github.com/voxosolution-blip/lakshan-backend-final  
**Health Check Endpoint**: `https://your-app.up.railway.app/health`  
**Database Health**: `https://your-app.up.railway.app/health/db`

---

## Next Steps

1. Update your frontend's API endpoint to point to Railway URL
2. Set up CI/CD (Railway auto-deploys on git push by default)
3. Consider setting up backups for your PostgreSQL database
4. Configure monitoring alerts

---

**Need Help?**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check your Railway service logs for detailed error messages

