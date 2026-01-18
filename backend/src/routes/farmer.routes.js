// Farmer Routes
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import * as farmerController from '../controllers/farmer.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get farmers with today's milk (main endpoint for Milk Collection page) - MUST be before /:id
router.get('/with-today-milk', farmerController.getAllFarmersWithTodayMilk);
// Get all farmers (simple list)
router.get('/', farmerController.getAllFarmers);
// Create farmer
router.post('/', farmerController.createFarmer);

// Milk collection routes (must be before /:id routes)
router.post('/milk-collection', farmerController.addMilkCollection);
router.get('/milk/total', farmerController.getTotalMilkInventory);

// Monthly report for farmer (must be before /:id)
router.get('/:id/monthly-report', farmerController.getFarmerMonthlyReport);
// Issue free products (deduct inventory) for a farmer/month (used by paysheet print)
router.post('/:id/issue-free-products', farmerController.issueFarmerFreeProducts);
// Add free products for farmer
router.post('/free-products', farmerController.addFarmerFreeProducts);

// Farmer CRUD routes with ID (must be LAST - after all specific routes)
router.get('/:id', farmerController.getFarmerById);
router.put('/:id', farmerController.updateFarmer);
router.delete('/:id', farmerController.deleteFarmer);

export default router;


