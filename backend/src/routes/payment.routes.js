// Payment Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as paymentController from '../controllers/payment.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', paymentController.getAllPayments);
router.get('/shop-wise', paymentController.getShopWisePaymentHistory);
router.post('/', paymentController.createPayment);
router.get('/pending', paymentController.getPendingPayments);
router.get('/ongoing-pending', paymentController.getOngoingPendingPayments);
router.get('/cheque-alerts', paymentController.getChequeExpiryAlerts);
// Cheques management - get all cheques (including from salesperson mobile) and update status
router.get('/cheques/all', paymentController.getAllCheques);
router.put('/cheques/:id/status', paymentController.updateChequeStatus);
router.get('/:id', paymentController.getPaymentById);

export default router;


