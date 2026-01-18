// Expenses Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as expensesController from '../controllers/expenses.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', expensesController.getAllExpenses);
router.post('/', expensesController.createExpense);
router.get('/monthly', expensesController.getMonthlyExpenses);
router.get('/:id', expensesController.getExpenseById);
router.put('/:id', expensesController.updateExpense);
router.delete('/:id', expensesController.deleteExpense);

export default router;


