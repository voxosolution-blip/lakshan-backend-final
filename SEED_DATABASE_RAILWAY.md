# How to Seed Users on Railway

Your database needs default users to log in. Here's how to add them:

## Default Credentials (after seeding)
- **Admin**: username=`admin`, password=`admin123`
- **Salesperson**: username=`salesperson`, password=`salesperson123`

## Method 1: Using Railway CLI (Easiest)

1. **Install Railway CLI** (if not installed):
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Link to your project**:
   ```bash
   cd path/to/lakshan-backend-final
   railway link
   ```
   (Select your Railway project when prompted)

4. **Run the seed script**:
   ```bash
   railway run npm run seed
   ```

5. **Verify it worked** - You should see:
   ```
   ✅ Seed data completed
   📝 Default credentials:
      Admin: username=admin | password=admin123
      Sales Person 1: username=salesperson | password=salesperson123
   ```

## Method 2: Using Railway Dashboard Shell

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click on your **backend service**
3. Click on the **Shell** tab (or terminal icon)
4. Run:
   ```bash
   cd backend
   npm run seed
   ```

## Method 3: Using API Register Endpoint

You can create a user via the API:

```bash
curl -X POST https://lakshan-backend-final-production.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "email": "admin@yogurt.com",
    "name": "System Administrator",
    "role": "ADMIN"
  }'
```

Or create a salesperson:
```bash
curl -X POST https://lakshan-backend-final-production.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "salesperson",
    "password": "salesperson123",
    "email": "salesperson@yogurt.com",
    "name": "Sales Person 1",
    "role": "SALESPERSON"
  }'
```

## After Seeding

Once you've seeded the database, you can log in with:
- **Admin**: `admin` / `admin123`
- **Salesperson**: `salesperson` / `salesperson123`

Test the login at:
```
POST https://lakshan-backend-final-production.up.railway.app/api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```






