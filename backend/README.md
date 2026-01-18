# Yoghurt Factory ERP - Backend API

Production-ready Node.js/Express backend with PostgreSQL database.

## 🚀 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup
1. Create PostgreSQL database:
```sql
CREATE DATABASE yogurt_erp;
```

2. Run schema:
```bash
psql -U postgres -d yogurt_erp -f ./database/schema.sql
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and configure:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=yogurt_erp
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_super_secret_jwt_key
PORT=5000
```

### 4. Seed Data
```bash
npm run seed
```

### 5. Start Server
```bash
# Development
npm run dev

# Production
npm start
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/         # Database & app config
│   ├── controllers/    # Business logic
│   ├── middlewares/    # Auth, validation, error handling
│   ├── models/         # Data models (if using ORM)
│   ├── routes/         # API routes
│   ├── services/       # Service layer
│   ├── utils/          # Utilities (JWT, password, etc.)
│   └── views/          # JSON response formatters
├── server.js           # Entry point
└── package.json
```

## 🔐 Authentication

All routes (except `/api/auth/login`) require JWT token in header:
```
Authorization: Bearer <token>
```

## 📊 API Endpoints

### Auth
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register (admin only)
- `GET /api/auth/profile` - Get current user profile

### Farmers
- `GET /api/farmers` - List farmers
- `POST /api/farmers` - Create farmer
- `GET /api/farmers/:id` - Get farmer
- `PUT /api/farmers/:id` - Update farmer
- `DELETE /api/farmers/:id` - Delete farmer
- `POST /api/farmers/milk-collection` - Add milk collection
- `GET /api/farmers/:id/milk-history` - Get milk history
- `GET /api/farmers/milk/total` - Get total milk inventory

### Inventory
- `GET /api/inventory` - List inventory items
- `POST /api/inventory` - Create item
- `GET /api/inventory/:id` - Get item
- `PUT /api/inventory/:id` - Update item
- `DELETE /api/inventory/:id` - Delete item
- `POST /api/inventory/:id/adjust` - Adjust stock
- `GET /api/inventory/alerts/low-stock` - Low stock alerts
- `GET /api/inventory/alerts/expiry` - Expiry alerts

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/:id` - Get product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `GET /api/products/:id/bom` - Get product BOM
- `POST /api/products/:id/bom` - Add BOM item
- `DELETE /api/products/:id/bom/:bomId` - Delete BOM item

### Production
- `GET /api/production` - List productions
- `POST /api/production` - Create production
- `GET /api/production/today` - Today's production

### Sales
- `GET /api/sales` - List sales
- `POST /api/sales` - Create sale
- `GET /api/sales/today` - Today's sales

### Payments
- `GET /api/payments` - List payments
- `POST /api/payments` - Create payment
- `GET /api/payments/pending` - Pending payments

### Returns
- `GET /api/returns` - List returns
- `POST /api/returns` - Create return

### Expenses
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense
- `GET /api/expenses/monthly` - Monthly expenses

### Dashboard
- `GET /api/dashboard/admin` - Admin dashboard data
- `GET /api/dashboard/sales` - Sales dashboard data

## 🔒 Role-Based Access Control

Roles:
- `ADMIN` - Full access
- `SALESPERSON` - Sales, payments, returns
- `ACCOUNTANT` - Reports, payments, expenses
- `PRODUCTION` - Production, inventory

Use `authorize('ADMIN', 'ACCOUNTANT')` middleware for role-based routes.

## 📝 Notes

- All timestamps are in UTC
- Use transactions for multi-step operations
- Inventory adjustments are logged
- Production auto-deducts inventory and adds finished goods











