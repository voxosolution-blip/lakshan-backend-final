// Salesperson Routes
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import {
  updateLocation,
  getMyLocation,
  getAllLocations,
  getMyShops,
  addShop,
  updateShopLocation,
  getMyInventory,
  createMobileSale,
  getShopSales
} from '../controllers/salesperson.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// LOCATION TRACKING
// ============================================
router.post('/location', authorize(['SALESPERSON']), updateLocation);
router.get('/location/me', authorize(['SALESPERSON']), getMyLocation);
router.get('/locations/all', authorize(['ADMIN']), getAllLocations);

// ============================================
// SHOPS MANAGEMENT
// ============================================
router.get('/shops', authorize(['SALESPERSON']), getMyShops);
router.post('/shops', authorize(['SALESPERSON']), addShop);
router.put('/shops/:id/location', authorize(['SALESPERSON']), updateShopLocation);
router.get('/shops/:shopId/sales', authorize(['SALESPERSON']), getShopSales);

// ============================================
// INVENTORY ALLOCATION
// ============================================
router.get('/inventory', authorize(['SALESPERSON']), getMyInventory);

// ============================================
// MOBILE SALES
// ============================================
router.post('/sales', authorize(['SALESPERSON']), createMobileSale);

export default router;
