// Settings Routes
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import * as settingsController from '../controllers/settings.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get milk price
router.get('/milk-price', settingsController.getMilkPrice);
// Update milk price (admin only)
router.put('/milk-price', authorize(['ADMIN']), settingsController.updateMilkPrice);

// Get setting by key (must be before /:key route)
router.get('/:key', settingsController.getSetting);
// Update setting by key (admin only, must be before /:key route)
router.put('/:key', authorize(['ADMIN']), settingsController.updateSetting);

export default router;




