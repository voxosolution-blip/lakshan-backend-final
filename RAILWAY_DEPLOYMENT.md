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

### 4.1 Connect Database to Your App

1. Go back to your **backend service** (not the database)
2. Click on **"Variables"** tab
3. Click **"New Variable"**
4. Add the following variables by clicking **"Reference Variable"**:

   - Variable: `DB_HOST` → Reference: `${{Postgres.PGHOST}}`
   - Variable: `DB_PORT` → Reference: `${{Postgres.PGPORT}}`
   - Variable: `DB_NAME` → Reference: `${{Postgres.PGDATABASE}}`
   - Variable: `DB_USER` → Reference: `${{Postgres.PGUSER}}`
   - Variable: `DB_PASSWORD` → Reference: `${{Postgres.PGPASSWORD}}`

   *(Replace `Postgres` with your actual PostgreSQL service name if different)*

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

## Step 6: Set Up Database Schema

### 6.1 Connect to Railway PostgreSQL

You have two options:

**Option A: Using Railway's PostgreSQL Connect Button**
1. Go to your PostgreSQL service
2. Click **"Connect"** button
3. Railway will provide connection details

**Option B: Using psql from your local machine**
1. Get connection string from PostgreSQL service → Variables tab
2. Use psql to connect:
   ```bash
   psql $DATABASE_URL
   ```

### 6.2 Run Database Schema

1. Connect to the database (as above)
2. Copy contents of `backend/database/schema.sql`
3. Paste and run in your database client
4. Alternatively, if you have a migration tool, run migrations

### 6.3 Seed Initial Data (Optional)

If you have seed data:
1. SSH into Railway or use Railway CLI
2. Run: `npm run seed`

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

### Database Connection Errors
- Verify all database environment variables are set correctly
- Check that PostgreSQL service is running
- Verify variable references use correct service name

### Port Issues
- Railway sets `PORT` automatically - don't override it
- Your code uses `process.env.PORT || 5000` which is correct ✅

### Application Crashes
- Check **Logs** in Railway dashboard
- Verify all required environment variables are set
- Check database schema is initialized

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

