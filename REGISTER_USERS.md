# Quick User Registration Guide

## Method 1: Browser Console (Easiest & Fastest) ⚡

1. Open your browser's Developer Console (F12 or Right-click → Inspect → Console)
2. Copy and paste this code to create an admin user:

```javascript
fetch('https://lakshan-backend-final-production.up.railway.app/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123',
    email: 'admin@yogurt.com',
    name: 'System Administrator',
    role: 'ADMIN'
  })
})
.then(res => res.json())
.then(data => {
  console.log('✅ Admin user created:', data);
})
.catch(error => {
  console.error('❌ Error:', error);
});
```

3. Press Enter. You should see: `✅ Admin user created: {success: true, ...}`

4. (Optional) Create salesperson user:

```javascript
fetch('https://lakshan-backend-final-production.up.railway.app/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'salesperson',
    password: 'salesperson123',
    email: 'salesperson@yogurt.com',
    name: 'Sales Person 1',
    role: 'SALESPERSON'
  })
})
.then(res => res.json())
.then(data => {
  console.log('✅ Salesperson user created:', data);
})
.catch(error => {
  console.error('❌ Error:', error);
});
```

## Method 2: Railway Dashboard Shell

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click on your **backend service**
3. Click on the **Shell** tab (terminal icon in the top bar)
4. Run:
   ```bash
   cd backend
   node seed-on-railway.js
   ```
   OR
   ```bash
   cd backend
   npm run seed
   ```

## Method 3: Using Postman or any API Client

**Create Admin User:**
- URL: `POST https://lakshan-backend-final-production.up.railway.app/api/auth/register`
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "username": "admin",
  "password": "admin123",
  "email": "admin@yogurt.com",
  "name": "System Administrator",
  "role": "ADMIN"
}
```

**Create Salesperson:**
- URL: `POST https://lakshan-backend-final-production.up.railway.app/api/auth/register`
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "username": "salesperson",
  "password": "salesperson123",
  "email": "salesperson@yogurt.com",
  "name": "Sales Person 1",
  "role": "SALESPERSON"
}
```

## After Registration

You can now log in with:
- **Admin**: `admin` / `admin123`
- **Salesperson**: `salesperson` / `salesperson123`

Test login:
```javascript
fetch('https://lakshan-backend-final-production.up.railway.app/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
})
.then(res => res.json())
.then(data => {
  console.log('Login successful!', data);
})
.catch(error => {
  console.error('Login failed:', error);
});
```





