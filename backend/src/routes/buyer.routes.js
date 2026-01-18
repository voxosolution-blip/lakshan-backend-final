// Buyer Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as buyerController from '../controllers/buyer.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/payment-status', buyerController.getBuyersWithPaymentStatus);
router.get('/', buyerController.getAllBuyers);
router.post('/', buyerController.createBuyer);
router.get('/:id', buyerController.getBuyerById);
router.put('/:id', buyerController.updateBuyer);
router.delete('/:id', buyerController.deleteBuyer);

export default router;


