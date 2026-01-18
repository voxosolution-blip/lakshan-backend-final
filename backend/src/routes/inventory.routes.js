// Inventory Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as inventoryController from '../controllers/inventory.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', inventoryController.getAllInventory);
router.get('/milk/by-date', inventoryController.getMilkInventoryByDate);
router.get('/milk/today-usage', inventoryController.getTodayMilkUsage);
router.post('/', inventoryController.createInventory);
router.get('/alerts/low-stock', inventoryController.getLowStockAlerts);
router.get('/alerts/expiry', inventoryController.getExpiryAlerts);
router.get('/:id', inventoryController.getInventoryById);
router.put('/:id', inventoryController.updateInventory);
router.delete('/:id', inventoryController.deleteInventory);
router.post('/:id/adjust', inventoryController.adjustStock);

export default router;


