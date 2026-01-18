// Scheduled Tasks Service
import cron from 'node-cron';
import pool from '../config/db.js';

/**
 * Update inventory with remaining allocated stock
 * This runs daily at 7 PM to move remaining allocated stock (allocated - sold - returned) back to inventory
 */
export async function updateInventoryWithRemainingStock() {
  const client = await pool.connect();
  try {
    console.log('🔄 [Scheduled Task] Starting daily inventory update at 7 PM...');
    
    await client.query('BEGIN');
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Get all allocations from today with their remaining quantities (allocated - sold - returned)
    const allocationsResult = await client.query(`
      SELECT 
        sa.id as allocation_id,
        sa.production_id,
        sa.product_id,
        sa.quantity_allocated,
        sa.batch_number,
        sa.allocation_date,
        pr.name as product_name,
        p.date as production_date,
        -- Calculate remaining: allocated - sold - returned
        (sa.quantity_allocated - 
         COALESCE((
           SELECT SUM(si.quantity) 
           FROM sale_items si 
           JOIN sales s ON si.sale_id = s.id 
           WHERE si.product_id = sa.product_id 
             AND s.salesperson_id = sa.salesperson_id 
             AND si.is_return = false
             AND s.date = $1
         ), 0) +
         COALESCE((
           SELECT SUM(si.quantity) 
           FROM sale_items si 
           JOIN sales s ON si.sale_id = s.id 
           WHERE si.product_id = sa.product_id 
             AND s.salesperson_id = sa.salesperson_id 
             AND si.is_return = true
             AND s.date = $1
         ), 0)
        ) as remaining_quantity
      FROM salesperson_allocations sa
      JOIN products pr ON sa.product_id = pr.id
      JOIN productions p ON sa.production_id = p.id
      WHERE sa.allocation_date = $1 
        AND sa.status = 'active'
    `, [today]);
    
    if (allocationsResult.rows.length === 0) {
      console.log('   ℹ️  No allocations found for today');
      await client.query('COMMIT');
      return;
    }
    
    console.log(`   📦 Found ${allocationsResult.rows.length} allocation(s) to process`);
    
    // Group by product to sum remaining quantities
    const productRemaining = new Map();
    
    for (const allocation of allocationsResult.rows) {
      const remaining = parseFloat(allocation.remaining_quantity || 0);
      
      if (remaining <= 0) continue;
      
      const productId = allocation.product_id;
      const productName = allocation.product_name;
      
      if (!productRemaining.has(productId)) {
        productRemaining.set(productId, {
          productName,
          totalRemaining: 0,
          allocations: []
        });
      }
      
      const productData = productRemaining.get(productId);
      productData.totalRemaining += remaining;
      productData.allocations.push({
        allocationId: allocation.allocation_id,
        productionId: allocation.production_id,
        batchNumber: allocation.batch_number,
        remaining
      });
    }
    
    if (productRemaining.size === 0) {
      console.log('   ℹ️  No remaining stock to add to inventory');
      await client.query('COMMIT');
      return;
    }
    
    let updatedCount = 0;
    
    for (const [productId, productData] of productRemaining.entries()) {
      const { productName, totalRemaining } = productData;
      
      // Get finished goods inventory item
      const itemResult = await client.query(`
        SELECT i.id 
        FROM inventory_items i
        JOIN inventory_categories c ON i.category_id = c.id
        WHERE i.name = $1 AND c.name = 'Finished Goods'
        LIMIT 1
      `, [productName]);
      
      if (itemResult.rows.length === 0) {
        console.log(`   ⚠️  Finished goods item not found for: ${productName}`);
        continue;
      }
      
      const itemId = itemResult.rows[0].id;
      
      // Get current inventory quantity
      const currentInventoryResult = await client.query(`
        SELECT COALESCE(quantity, 0) as current_quantity
        FROM inventory_items
        WHERE id = $1
      `, [itemId]);
      
      const currentQuantity = parseFloat(currentInventoryResult.rows[0]?.current_quantity || 0);
      const newQuantity = currentQuantity + totalRemaining;
      
      // Update inventory_items quantity
      await client.query(`
        UPDATE inventory_items 
        SET quantity = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newQuantity, itemId]);
      
      // Also update inventory_batches to reflect this in available batches
      // Create a batch entry for the remaining stock
      const batchNumber = `RETURN-${today.replace(/-/g, '')}`;
      await client.query(`
        INSERT INTO inventory_batches (
          inventory_item_id, 
          production_id, 
          batch_number, 
          quantity, 
          production_date, 
          status
        )
        VALUES ($1, NULL, $2, $3, $4, 'available')
        ON CONFLICT (inventory_item_id, batch_number) 
        DO UPDATE SET
          quantity = inventory_batches.quantity + EXCLUDED.quantity,
          status = 'available',
          updated_at = CURRENT_TIMESTAMP
      `, [
        itemId,
        batchNumber,
        totalRemaining,
        today
      ]);
      
      updatedCount++;
      console.log(`   ✅ Updated ${productName} - Added ${totalRemaining} units to inventory (New total: ${newQuantity})`);
    }
    
    await client.query('COMMIT');
    console.log(`✅ [Scheduled Task] Completed! Updated ${updatedCount} inventory item(s) with remaining allocated stock`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [Scheduled Task] Error updating inventory:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Initialize scheduled tasks
 */
export function initializeScheduledTasks() {
  console.log('⏰ Initializing scheduled tasks...');
  
  // Schedule daily inventory update at 7 PM (19:00)
  // Cron format: minute hour day month dayOfWeek
  // '0 19 * * *' = Every day at 7:00 PM
  cron.schedule('0 19 * * *', async () => {
    try {
      await updateInventoryWithRemainingStock();
    } catch (error) {
      console.error('❌ Scheduled task failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Colombo" // Sri Lanka timezone
  });
  
  console.log('   ✅ Scheduled daily inventory update at 7:00 PM (Asia/Colombo timezone)');
  
  // Optional: Run immediately on startup for testing (comment out in production)
  // updateInventoryWithRemainingStock();
}

export default {
  initializeScheduledTasks,
  updateInventoryWithRemainingStock
};

