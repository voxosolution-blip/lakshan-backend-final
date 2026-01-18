// Dashboard Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/admin', dashboardController.getAdminDashboard);
router.get('/sales', dashboardController.getSalesDashboard);
router.post('/location', dashboardController.updateSalespersonLocation);
router.get('/locations', dashboardController.getAllSalespersonLocations);
router.get('/milk-chart', dashboardController.getDailyMilkChartData);
router.get('/product-sales', dashboardController.getProductSalesData);
router.get('/shop-wise-sales', dashboardController.getShopWiseSalesData);
router.get('/finished-goods-chart', dashboardController.getFinishedGoodsChartData);
router.get('/salesperson-stock', dashboardController.getSalespersonStock);
router.get('/today-sales-returns', dashboardController.getTodaySalesAndReturns);

export default router;


