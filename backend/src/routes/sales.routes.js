// Sales Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as salesController from '../controllers/sales.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', salesController.getAllSales);
router.post('/', salesController.createSale);
router.get('/today', salesController.getTodaySales);
router.put('/:id', salesController.updateSale);
router.post('/:id/reverse', salesController.reverseSale);
router.delete('/:id', salesController.deleteSale); // Must be before /:id route
router.get('/:id', salesController.getSaleById);

export default router;


