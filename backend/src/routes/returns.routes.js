// Returns Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as returnsController from '../controllers/returns.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', returnsController.getAllReturns);
router.post('/', returnsController.createReturn);
router.get('/:id', returnsController.getReturnById);
router.delete('/:id', returnsController.deleteReturn);

export default router;


