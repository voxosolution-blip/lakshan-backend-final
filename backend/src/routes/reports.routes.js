// Reports Routes (Read-only, audit-ready)
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import * as reportsController from '../controllers/reports.controller.js';

const router = express.Router();

router.use(authenticate);
router.get('/:key', authorize('ADMIN', 'ACCOUNTANT'), reportsController.getReport);
router.get('/:key/export/excel', authorize('ADMIN', 'ACCOUNTANT'), reportsController.exportExcel);
router.get('/:key/export/pdf', authorize('ADMIN', 'ACCOUNTANT'), reportsController.exportPdf);

export default router;


