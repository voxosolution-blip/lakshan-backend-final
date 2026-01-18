// Authentication Routes
import express from 'express';
import { login, register, getProfile, getSalespersons } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/profile', authenticate, getProfile);
router.get('/salespersons', authenticate, getSalespersons);

export default router;




