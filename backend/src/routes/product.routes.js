// Product Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as productController from '../controllers/product.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', productController.getAllProducts);
router.post('/', productController.createProduct);
router.get('/:id', productController.getProductById);
router.put('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

// BOM routes
router.get('/:id/bom', productController.getProductBOM);
router.post('/:id/bom', productController.addBOMItem);
router.delete('/:id/bom/:bomId', productController.deleteBOMItem);

export default router;


