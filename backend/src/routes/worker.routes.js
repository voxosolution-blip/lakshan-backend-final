// Worker Routes
import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import * as workerController from '../controllers/worker.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get workers with today's attendance (main endpoint for Salary page) - MUST be before /:id
router.get('/with-today-attendance', workerController.getAllWorkersWithTodayAttendance);
// Get all workers (simple list)
router.get('/', workerController.getAllWorkers);
// Create worker
router.post('/', workerController.createWorker);

// Attendance routes (must be before /:id routes)
router.post('/attendance', workerController.addAttendance);

// Advance payment routes
router.post('/advance', workerController.addAdvance);

// Free products routes
router.post('/free-products', workerController.addFreeProducts);

// Salary bonus routes
router.post('/salary-bonus', workerController.addSalaryBonus);

// Payroll generation routes
router.post('/generate-payroll', workerController.generatePayroll);

// Monthly report for worker (must be before /:id)
router.get('/:id/monthly-report', workerController.getWorkerMonthlyReport);
// Issue free products (deduct inventory) for a worker/month (used by paysheet print)
router.post('/:id/issue-free-products', workerController.issueWorkerFreeProducts);

// Worker CRUD routes with ID (must be LAST - after all specific routes)
router.get('/:id', workerController.getWorkerById);
router.put('/:id', workerController.updateWorker);
router.delete('/:id', workerController.deleteWorker);

export default router;

