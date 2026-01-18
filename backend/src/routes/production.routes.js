// Production Routes
import express from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as productionController from '../controllers/production.controller.js';
import { updateInventoryWithRemainingStock } from '../services/scheduledTasks.js';

const router = express.Router();

router.use(authenticate);

// Production capacity calculator
router.get('/capacity', productionController.getProductionCapacity);
// Today's production summary
router.get('/today', productionController.getTodayProduction);
// Today's production with allocations
router.get('/today/allocations', productionController.getTodayProductionWithAllocations);
// Salesperson inventory (allocated products) - MUST be before /:id route
router.get('/salesperson/inventory', productionController.getSalespersonInventory);
// All productions
router.get('/', productionController.getAllProductions);
// Create production
router.post('/', productionController.createProduction);
// Salesperson allocation
router.post('/allocation', productionController.createSalesAllocation);
router.get('/allocations', productionController.getSalesAllocations);
// Manual trigger for daily inventory update (for testing/admin use)
router.post('/update-inventory', async (req, res, next) => {
  try {
    await updateInventoryWithRemainingStock();
    res.json({ 
      success: true, 
      message: 'Inventory updated successfully with remaining production stock' 
    });
  } catch (error) {
    next(error);
  }
});
// Single production (must be last to avoid matching other routes)
router.get('/:id', productionController.getProductionById);

export default router;


