// Production Controller
import pool from '../config/db.js';
import { convert, areUnitsCompatible } from '../utils/unitConverter.js';

// Get production capacity (how many units can be produced with current stock)
export const getProductionCapacity = async (req, res, next) => {
  try {
    // Get all active products with their BOM
    const productsResult = await pool.query(`
      SELECT p.id, p.name, p.category
      FROM products p
      WHERE p.is_active = true
      ORDER BY p.name
    `);
    
    const capacityData = [];
    
    for (const product of productsResult.rows) {
      // Get BOM for this product
      const bomResult = await pool.query(`
        SELECT 
          pb.inventory_item_id,
          pb.quantity_required,
          pb.unit,
          i.name as inventory_name,
          i.quantity as current_stock
        FROM product_bom pb
        JOIN inventory_items i ON pb.inventory_item_id = i.id
        WHERE pb.product_id = $1
      `, [product.id]);
      
      if (bomResult.rows.length > 0) {
        // Calculate minimum possible units based on all ingredients
        let minPossible = Infinity;
        
        for (const bomItem of bomResult.rows) {
          const available = parseFloat(bomItem.current_stock || 0);
          const requiredPerUnit = parseFloat(bomItem.quantity_required || 0);
          
          if (requiredPerUnit > 0) {
            const possibleUnits = Math.floor(available / requiredPerUnit);
            minPossible = Math.min(minPossible, possibleUnits);
          }
        }
        
        capacityData.push({
          productId: product.id,
          productName: product.name,
          productCategory: product.category,
          maxPossibleUnits: minPossible === Infinity ? 0 : minPossible,
          ingredients: bomResult.rows.map(bom => ({
            inventoryItemId: bom.inventory_item_id,
            inventoryName: bom.inventory_name,
            quantityRequired: parseFloat(bom.quantity_required),
            unit: bom.unit,
            currentStock: parseFloat(bom.current_stock || 0)
          }))
        });
      } else {
        // Product has no BOM, can't calculate capacity
        capacityData.push({
          productId: product.id,
          productName: product.name,
          productCategory: product.category,
          maxPossibleUnits: 0,
          ingredients: [],
          message: 'No recipe defined'
        });
      }
    }
    
    res.json({ success: true, data: capacityData });
  } catch (error) {
    console.error('Error calculating production capacity:', error);
    next(error);
  }
};

// Get all productions
export const getAllProductions = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.date,
        p.batch,
        p.quantity_produced,
        p.notes,
        p.created_at,
        pr.id as product_id,
        pr.name as product_name,
        pr.category as product_category
      FROM productions p
      JOIN products pr ON p.product_id = pr.id
      ORDER BY p.date DESC, p.created_at DESC
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get today's production summary
export const getTodayProduction = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        pr.name as product_name,
        pr.category,
        SUM(p.quantity_produced) as total_quantity,
        COUNT(p.id) as production_count
      FROM productions p
      JOIN products pr ON p.product_id = pr.id
      WHERE p.date = CURRENT_DATE
      GROUP BY pr.id, pr.name, pr.category
      ORDER BY pr.name
    `);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Create production with auto-deduction from inventory and batch tracking
export const createProduction = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { productId, date, quantityProduced, notes } = req.body;
    const userId = req.user?.userId;
    
    if (!productId || !quantityProduced || quantityProduced <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID and quantity produced are required' 
      });
    }
    
    await client.query('BEGIN');
    
    // Get product details
    const productResult = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (productResult.rows.length === 0) {
      throw new Error('Product not found');
    }
    const product = productResult.rows[0];
    
    // Get product BOM
    const bomResult = await client.query(`
      SELECT 
        pb.inventory_item_id,
        pb.quantity_required,
        pb.unit,
        i.name as inventory_name,
        i.quantity as current_stock,
        i.unit as inventory_unit
      FROM product_bom pb
      JOIN inventory_items i ON pb.inventory_item_id = i.id
      WHERE pb.product_id = $1
    `, [productId]);
    
    if (bomResult.rows.length === 0) {
      throw new Error('Product recipe (BOM) not found. Please set ingredients first in Product Management.');
    }
    
    // Check if we have enough stock for all ingredients
    const quantity = parseFloat(quantityProduced);
    const insufficientItems = [];
    
    for (const bomItem of bomResult.rows) {
      const requiredPerUnit = parseFloat(bomItem.quantity_required);
      const totalRequired = requiredPerUnit * quantity;
      
      // Handle unit conversion if needed
      let adjustedRequired = totalRequired;
      if (bomItem.unit !== bomItem.inventory_unit) {
        // Special case for Milk: allow kg ↔ liter conversion (1 kg ≈ 1 liter for milk)
        if (bomItem.inventory_name === 'Milk') {
          const fromUnit = (bomItem.unit || '').toLowerCase().trim();
          const toUnit = (bomItem.inventory_unit || '').toLowerCase().trim();
          
          if ((fromUnit === 'kg' && (toUnit === 'liter' || toUnit === 'l')) ||
              ((fromUnit === 'liter' || fromUnit === 'l') && toUnit === 'kg')) {
            // 1 kg ≈ 1 liter for milk (density ~1.03, but we use 1:1 for simplicity)
            adjustedRequired = totalRequired; // No conversion needed, 1:1 ratio
          } else if (areUnitsCompatible(bomItem.unit, bomItem.inventory_unit)) {
            adjustedRequired = convert(totalRequired, bomItem.unit, bomItem.inventory_unit);
          } else {
            throw new Error(`Unit mismatch: Cannot convert ${bomItem.unit} to ${bomItem.inventory_unit} for ${bomItem.inventory_name}`);
          }
        } else if (areUnitsCompatible(bomItem.unit, bomItem.inventory_unit)) {
          adjustedRequired = convert(totalRequired, bomItem.unit, bomItem.inventory_unit);
        } else {
          throw new Error(`Unit mismatch: Cannot convert ${bomItem.unit} to ${bomItem.inventory_unit} for ${bomItem.inventory_name}`);
        }
      }
      
      // For Milk, calculate current stock dynamically (total_collected - total_used)
      // For other items, use the stored quantity
      let currentStock;
      if (bomItem.inventory_name === 'Milk') {
        // Get Raw Materials category ID
        const categoryResult = await client.query(
          `SELECT id FROM inventory_categories 
           WHERE name IN ('Raw Materials', 'Raw Material')
           LIMIT 1`
        );
        const categoryId = categoryResult.rows.length > 0 ? categoryResult.rows[0].id : null;
        
        if (categoryId) {
          // Calculate total collected
          const totalCollectedResult = await client.query(
            `SELECT COALESCE(SUM(quantity_liters), 0) as total_collected
             FROM milk_collections`
          );
          const totalCollected = parseFloat(totalCollectedResult.rows[0].total_collected || 0);
          
          // Calculate total used (excluding the current production we're about to create)
          const totalUsedResult = await client.query(
            `SELECT COALESCE(SUM(
               CASE 
                 WHEN pb.unit = 'liter' OR pb.unit = 'l' THEN p.quantity_produced * pb.quantity_required
                 WHEN pb.unit = 'ml' THEN p.quantity_produced * pb.quantity_required / 1000.0
                 WHEN pb.unit = 'kg' THEN p.quantity_produced * pb.quantity_required
                 ELSE p.quantity_produced * pb.quantity_required
               END
             ), 0) as total_used
             FROM productions p
             JOIN product_bom pb ON p.product_id = pb.product_id
             JOIN inventory_items i ON pb.inventory_item_id = i.id
             WHERE i.name = 'Milk' AND i.category_id = $1`,
            [categoryId]
          );
          const totalUsed = parseFloat(totalUsedResult.rows[0].total_used || 0);
          currentStock = Math.max(0, totalCollected - totalUsed);
        } else {
          currentStock = parseFloat(bomItem.current_stock || 0);
        }
      } else {
        currentStock = parseFloat(bomItem.current_stock || 0);
      }
      
      if (currentStock < adjustedRequired) {
        insufficientItems.push({
          item: bomItem.inventory_name,
          required: adjustedRequired,
          available: currentStock,
          shortfall: adjustedRequired - currentStock,
          unit: bomItem.inventory_unit
        });
      }
    }
    
    if (insufficientItems.length > 0) {
      const errorMsg = insufficientItems.map(item => 
        `${item.item}: Need ${item.required.toFixed(2)} ${item.unit}, Have ${item.available.toFixed(2)} ${item.unit} (Short: ${item.shortfall.toFixed(2)} ${item.unit})`
      ).join('; ');
      throw new Error(`Insufficient stock: ${errorMsg}`);
    }
    
    // Generate production date and batch number
    const productionDate = date || new Date().toISOString().split('T')[0];
    
    // Get or create finished goods inventory item
    const finishedGoodsCategoryResult = await client.query(
      `SELECT id FROM inventory_categories WHERE name = 'Finished Goods' LIMIT 1`
    );
    
    if (finishedGoodsCategoryResult.rows.length === 0) {
      throw new Error('Finished Goods category not found');
    }
    
    let finishedGoodsItemId;
    const existingItemResult = await client.query(
      `SELECT id FROM inventory_items 
       WHERE name = $1 AND category_id = $2
       LIMIT 1`,
      [product.name, finishedGoodsCategoryResult.rows[0].id]
    );
    
    if (existingItemResult.rows.length > 0) {
      finishedGoodsItemId = existingItemResult.rows[0].id;
    } else {
      // Create finished goods inventory item
      const newItemResult = await client.query(
        `INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
         VALUES ($1, $2, 'piece', 0, 0)
         RETURNING id`,
        [product.name, finishedGoodsCategoryResult.rows[0].id]
      );
      finishedGoodsItemId = newItemResult.rows[0].id;
    }
    
    // Generate batch number using database function (with explicit type casting)
    const batchNumberResult = await client.query(
      `SELECT generate_batch_number($1::UUID, $2::DATE) as batch_number`,
      [finishedGoodsItemId, productionDate]
    );
    const batchNumber = batchNumberResult.rows[0].batch_number;
    
    // Create production record FIRST (before deducting inventory)
    // This ensures milk calculation includes this production
    const productionResult = await client.query(
      `INSERT INTO productions (product_id, quantity_produced, date, batch, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [productId, quantity, productionDate, batchNumber, notes || null, userId]
    );
    const production = productionResult.rows[0];
    
    // NOW deduct inventory items based on recipe (after production is created)
    for (const bomItem of bomResult.rows) {
      const requiredPerUnit = parseFloat(bomItem.quantity_required);
      let totalRequired = requiredPerUnit * quantity;
      const originalTotalRequired = totalRequired;
      
      // Handle unit conversion
      if (bomItem.unit !== bomItem.inventory_unit) {
        // Special case for Milk: allow kg ↔ liter conversion (1 kg ≈ 1 liter for milk)
        if (bomItem.inventory_name === 'Milk') {
          const fromUnit = (bomItem.unit || '').toLowerCase().trim();
          const toUnit = (bomItem.inventory_unit || '').toLowerCase().trim();
          
          if ((fromUnit === 'kg' && (toUnit === 'liter' || toUnit === 'l')) ||
              ((fromUnit === 'liter' || fromUnit === 'l') && toUnit === 'kg')) {
            // 1 kg ≈ 1 liter for milk (density ~1.03, but we use 1:1 for simplicity)
            totalRequired = totalRequired; // No conversion needed, 1:1 ratio
          } else if (areUnitsCompatible(bomItem.unit, bomItem.inventory_unit)) {
            totalRequired = convert(totalRequired, bomItem.unit, bomItem.inventory_unit);
          } else {
            throw new Error(`Unit mismatch: Cannot convert ${bomItem.unit} to ${bomItem.inventory_unit} for ${bomItem.inventory_name}`);
          }
        } else if (areUnitsCompatible(bomItem.unit, bomItem.inventory_unit)) {
          totalRequired = convert(totalRequired, bomItem.unit, bomItem.inventory_unit);
        } else {
          throw new Error(`Unit mismatch: Cannot convert ${bomItem.unit} to ${bomItem.inventory_unit} for ${bomItem.inventory_name}`);
        }
      }
      
      // Special handling for Milk - recalculate inventory instead of direct deduction
      if (bomItem.inventory_name === 'Milk') {
        // Milk inventory is calculated as: total_collected - total_used
        // Now that production is created, this calculation will include it
        const totalCollectedResult = await client.query(
          `SELECT COALESCE(SUM(quantity_liters), 0) as total_collected
           FROM milk_collections`
        );
        const totalCollected = parseFloat(totalCollectedResult.rows[0].total_collected || 0);
        
        // Calculate total used: sum of (quantity_produced * quantity_required) for all productions using milk
        // This now includes the production we just created
        const newTotalUsedResult = await client.query(
          `SELECT COALESCE(SUM(
             CASE 
               WHEN pb.unit = 'liter' OR pb.unit = 'l' THEN p.quantity_produced * pb.quantity_required
               WHEN pb.unit = 'ml' THEN p.quantity_produced * pb.quantity_required / 1000.0
               WHEN pb.unit = 'kg' THEN p.quantity_produced * pb.quantity_required  -- 1 kg ≈ 1 liter for milk
               ELSE p.quantity_produced * pb.quantity_required
             END
           ), 0) as total_used
           FROM productions p
           JOIN product_bom pb ON p.product_id = pb.product_id
           WHERE pb.inventory_item_id = $1`,
          [bomItem.inventory_item_id]
        );
        const newTotalUsed = parseFloat(newTotalUsedResult.rows[0].total_used || 0);
        const newAvailableMilk = Math.max(0, totalCollected - newTotalUsed);
        
        await client.query(
          `UPDATE inventory_items 
           SET quantity = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newAvailableMilk, bomItem.inventory_item_id]
        );
      } else {
        // For other items, directly deduct
        await client.query(
          `UPDATE inventory_items 
           SET quantity = GREATEST(0, quantity - $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [totalRequired, bomItem.inventory_item_id]
        );
      }
    }
    
    // Create inventory batch record for finished goods
    await client.query(
      `INSERT INTO inventory_batches (inventory_item_id, production_id, batch_number, quantity, production_date, status)
       VALUES ($1, $2, $3, $4, $5, 'available')
       ON CONFLICT (inventory_item_id, batch_number) DO UPDATE
       SET quantity = inventory_batches.quantity + EXCLUDED.quantity,
           status = 'available'`,
      [finishedGoodsItemId, production.id, batchNumber, quantity, productionDate]
    );
    
    // Recalculate finished goods inventory quantity from all available batches
    // This ensures accuracy when there are multiple productions or allocations
    const totalAvailableResult = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) as total_available
       FROM inventory_batches
       WHERE inventory_item_id = $1 AND status = 'available'`,
      [finishedGoodsItemId]
    );
    
    const totalAvailable = parseFloat(totalAvailableResult.rows[0].total_available || 0);
    
    await client.query(
      `UPDATE inventory_items 
       SET quantity = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [totalAvailable, finishedGoodsItemId]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      data: {
        ...production,
        product: product,
        batchNumber: batchNumber,
        finishedGoodsItemId: finishedGoodsItemId
      },
      message: `Production created successfully. Batch: ${batchNumber}. Inventory deducted and finished goods added.` 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating production:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Create salesperson allocation from production or inventory
export const createSalesAllocation = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { productionId, inventoryItemId, productId, salespersonId, quantityAllocated, notes, allocations } = req.body;
    const userId = req.user?.userId;
    
    // Support both single allocation and bulk allocations
    if (allocations && Array.isArray(allocations)) {
      // Bulk allocation mode
      await client.query('BEGIN');
      
      const results = [];
      for (const allocation of allocations) {
        const { productionId: prodId, productId: prodProdId, salespersonId: salesId, quantity } = allocation;
        
        if (!prodId || !prodProdId || !salesId || !quantity || quantity <= 0) {
          throw new Error('Invalid allocation data: Production ID, Product ID, Salesperson ID, and quantity are required');
        }
        
        // Get production details
        const productionResult = await client.query(
          `SELECT p.*, pr.name as product_name, p.batch
           FROM productions p
           JOIN products pr ON p.product_id = pr.id
           WHERE p.id = $1`,
          [prodId]
        );
        
        if (productionResult.rows.length === 0) {
          throw new Error(`Production ${prodId} not found`);
        }
        
        const production = productionResult.rows[0];
        const totalProduced = parseFloat(production.quantity_produced);
        
        // Get already allocated quantity for this production
        const allocatedResult = await client.query(
          `SELECT COALESCE(SUM(quantity_allocated), 0) as total_allocated
           FROM salesperson_allocations
           WHERE production_id = $1 AND status = 'active'`,
          [prodId]
        );
        
        const alreadyAllocated = parseFloat(allocatedResult.rows[0].total_allocated || 0);
        
        // Get available inventory stock for this product (from previous days' remaining allocations)
        const inventoryResult = await client.query(
          `SELECT COALESCE(i.quantity, 0) as inventory_stock
           FROM inventory_items i
           JOIN inventory_categories c ON i.category_id = c.id
           WHERE i.name = $1 AND c.name = 'Finished Goods'
           LIMIT 1`,
          [production.product_name]
        );
        
        const inventoryStock = parseFloat(inventoryResult.rows[0]?.inventory_stock || 0);
        
        // Available = Today's production remaining + Inventory stock from previous days
        const productionAvailable = totalProduced - alreadyAllocated;
        const totalAvailable = productionAvailable + inventoryStock;
        const qty = parseFloat(quantity);
        
        if (qty > totalAvailable) {
          throw new Error(`Insufficient quantity for ${production.product_name}. Available: ${totalAvailable.toFixed(2)} (Production: ${productionAvailable.toFixed(2)}, Inventory: ${inventoryStock.toFixed(2)}), Requested: ${qty}`);
        }
        
        // If allocating from inventory, reduce inventory first
        let remainingToAllocate = qty;
        if (inventoryStock > 0 && productionAvailable < qty) {
          const fromInventory = Math.min(inventoryStock, qty - productionAvailable);
          remainingToAllocate = qty - fromInventory;
          
          // Reduce inventory
          await client.query(
            `UPDATE inventory_items 
             SET quantity = GREATEST(0, quantity - $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = (SELECT i.id FROM inventory_items i
                         JOIN inventory_categories c ON i.category_id = c.id
                         WHERE i.name = $2 AND c.name = 'Finished Goods'
                         LIMIT 1)`,
            [fromInventory, production.product_name]
          );
          
          // Update inventory batches (reduce from available batches)
          // First get the batch to update
          const batchToUpdateResult = await client.query(
            `SELECT ib.id, ib.quantity
             FROM inventory_batches ib
             JOIN inventory_items i ON ib.inventory_item_id = i.id
             JOIN inventory_categories c ON i.category_id = c.id
             WHERE i.name = $1 AND c.name = 'Finished Goods'
               AND ib.status = 'available'
               AND ib.quantity > 0
             ORDER BY ib.production_date ASC
             LIMIT 1`,
            [production.product_name]
          );
          
          if (batchToUpdateResult.rows.length > 0) {
            const batch = batchToUpdateResult.rows[0];
            const newQuantity = parseFloat(batch.quantity) - fromInventory;
            
            if (newQuantity <= 0) {
              // Delete batch if quantity would become 0 (constraint requires quantity > 0)
              await client.query(`DELETE FROM inventory_batches WHERE id = $1`, [batch.id]);
            } else {
              // Update batch with new quantity
              await client.query(
                `UPDATE inventory_batches
                 SET quantity = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [newQuantity, batch.id]
              );
            }
          }
        }
        
        // Create allocation record with full quantity
        // Note: If inventory was used, the allocation still shows full qty but production_id links to today's production
        const allocationResult = await client.query(
          `INSERT INTO salesperson_allocations (production_id, product_id, salesperson_id, batch_number, quantity_allocated, allocation_date, notes, allocated_by)
           VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7)
           RETURNING *`,
          [prodId, prodProdId, salesId, production.batch, qty, notes || null, userId]
        );
        
        // Update inventory batch status
        await client.query(
          `UPDATE inventory_batches 
           SET status = CASE 
             WHEN (SELECT COALESCE(SUM(quantity_allocated), 0) FROM salesperson_allocations WHERE production_id = $1 AND status = 'active') >= quantity 
             THEN 'allocated' 
             ELSE 'available' 
           END
           WHERE production_id = $1`,
          [prodId]
        );
        
        results.push(allocationResult.rows[0]);
      }
      
      await client.query('COMMIT');
      
      // Calculate remaining stock and store in inventory
      await updateRemainingStock(client, allocations);
      
      res.status(201).json({ 
        success: true, 
        data: results,
        message: `${results.length} allocation(s) created successfully` 
      });
    } else {
      // Single allocation mode
      if ((!productionId && !inventoryItemId) || !productId || !salespersonId || !quantityAllocated || quantityAllocated <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Production ID or Inventory Item ID, Product ID, Salesperson ID, and quantity are required' 
        });
      }
      
      await client.query('BEGIN');
      
      let production;
      let actualProductionId = productionId;
      let batchNumber;
      const qty = parseFloat(quantityAllocated);
      
      if (inventoryItemId) {
        // Allocating from inventory stock - find the oldest available batch
        const batchResult = await client.query(
          `SELECT ib.production_id, ib.batch_number, ib.quantity, p.batch as prod_batch, pr.name as product_name
           FROM inventory_batches ib
           JOIN inventory_items i ON ib.inventory_item_id = i.id
           JOIN productions p ON ib.production_id = p.id
           JOIN products pr ON p.product_id = pr.id
           WHERE i.id = $1 
             AND ib.status = 'available'
             AND ib.quantity > 0
           ORDER BY ib.production_date ASC, ib.created_at ASC
           LIMIT 1`,
          [inventoryItemId]
        );
        
        if (batchResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            message: 'No available inventory batches found for this item' 
          });
        }
        
        const batch = batchResult.rows[0];
        actualProductionId = batch.production_id;
        batchNumber = batch.batch_number || batch.prod_batch;
        
        // Get production details
        const productionResult = await client.query(
          `SELECT p.*, pr.name as product_name, p.batch
           FROM productions p
           JOIN products pr ON p.product_id = pr.id
           WHERE p.id = $1`,
          [actualProductionId]
        );
        
        if (productionResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Production not found' });
        }
        
        production = productionResult.rows[0];
        
        // Verify product matches
        const itemResult = await client.query(
          `SELECT i.*, pr.id as product_id
           FROM inventory_items i
           JOIN products pr ON i.name = pr.name
           WHERE i.id = $1 AND pr.id = $2
           LIMIT 1`,
          [inventoryItemId, productId]
        );
        
        if (itemResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            message: 'Inventory item does not match the selected product' 
          });
        }
        
        // Check available inventory stock
        const inventoryStockResult = await client.query(
          `SELECT COALESCE(SUM(quantity), 0) as available_stock
           FROM inventory_batches
           WHERE inventory_item_id = $1 AND status = 'available'`,
          [inventoryItemId]
        );
        
        const availableStock = parseFloat(inventoryStockResult.rows[0]?.available_stock || 0);
        
        if (qty > availableStock) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            message: `Insufficient inventory stock. Available: ${availableStock.toFixed(2)}, Requested: ${qty.toFixed(2)}` 
          });
        }
        
        // Reduce inventory batches (FIFO - oldest first)
        let remainingToAllocate = qty;
        const batchesToReduce = await client.query(
          `SELECT id, quantity, production_id, batch_number
           FROM inventory_batches
           WHERE inventory_item_id = $1 
             AND status = 'available'
             AND quantity > 0
           ORDER BY production_date ASC, created_at ASC`,
          [inventoryItemId]
        );
        
        for (const batch of batchesToReduce.rows) {
          if (remainingToAllocate <= 0) break;
          
          const batchQty = parseFloat(batch.quantity);
          const toReduce = Math.min(remainingToAllocate, batchQty);
          const newQuantity = batchQty - toReduce;
          
          if (newQuantity <= 0) {
            // Delete batch if quantity would become 0 (constraint requires quantity > 0)
            await client.query(
              `DELETE FROM inventory_batches WHERE id = $1`,
              [batch.id]
            );
          } else {
            // Update batch with new quantity
            await client.query(
              `UPDATE inventory_batches
               SET quantity = $1,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [newQuantity, batch.id]
            );
          }
          
          remainingToAllocate -= toReduce;
        }
        
        // Reduce inventory item quantity
        await client.query(
          `UPDATE inventory_items 
           SET quantity = GREATEST(0, quantity - $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [qty, inventoryItemId]
        );
        
      } else {
        // Allocating from production
        const productionResult = await client.query(
          `SELECT p.*, pr.name as product_name, p.batch
           FROM productions p
           JOIN products pr ON p.product_id = pr.id
           WHERE p.id = $1`,
          [productionId]
        );
        
        if (productionResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Production not found' });
        }
        
        production = productionResult.rows[0];
        batchNumber = production.batch;
        
        // Get already allocated quantity
        const allocatedResult = await client.query(
          `SELECT COALESCE(SUM(quantity_allocated), 0) as total_allocated
           FROM salesperson_allocations
           WHERE production_id = $1 AND status = 'active'`,
          [productionId]
        );
        
        const alreadyAllocated = parseFloat(allocatedResult.rows[0].total_allocated || 0);
        
        // Get available inventory stock for this product (from previous days' remaining allocations)
        const inventoryResult = await client.query(
          `SELECT COALESCE(i.quantity, 0) as inventory_stock
           FROM inventory_items i
           JOIN inventory_categories c ON i.category_id = c.id
           WHERE i.name = $1 AND c.name = 'Finished Goods'
           LIMIT 1`,
          [production.product_name]
        );
        
        const inventoryStock = parseFloat(inventoryResult.rows[0]?.inventory_stock || 0);
        
        // Available = Today's production remaining + Inventory stock from previous days
        const totalProduced = parseFloat(production.quantity_produced);
        const productionAvailable = totalProduced - alreadyAllocated;
        const totalAvailable = productionAvailable + inventoryStock;
        
        if (qty > totalAvailable) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            message: `Insufficient quantity. Available: ${totalAvailable.toFixed(2)} (Production: ${productionAvailable.toFixed(2)}, Inventory: ${inventoryStock.toFixed(2)}), Requested: ${qty}` 
          });
        }
        
        // If allocating from inventory, reduce inventory first
        let remainingToAllocate = qty;
        if (inventoryStock > 0 && productionAvailable < qty) {
          const fromInventory = Math.min(inventoryStock, qty - productionAvailable);
          remainingToAllocate = qty - fromInventory;
          
          // Reduce inventory
          await client.query(
            `UPDATE inventory_items 
             SET quantity = GREATEST(0, quantity - $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = (SELECT i.id FROM inventory_items i
                         JOIN inventory_categories c ON i.category_id = c.id
                         WHERE i.name = $2 AND c.name = 'Finished Goods'
                         LIMIT 1)`,
            [fromInventory, production.product_name]
          );
          
          // Update inventory batches (reduce from available batches)
          // First get the batch to update
          const batchToUpdateResult = await client.query(
            `SELECT ib.id, ib.quantity
             FROM inventory_batches ib
             JOIN inventory_items i ON ib.inventory_item_id = i.id
             JOIN inventory_categories c ON i.category_id = c.id
             WHERE i.name = $1 AND c.name = 'Finished Goods'
               AND ib.status = 'available'
               AND ib.quantity > 0
             ORDER BY ib.production_date ASC
             LIMIT 1`,
            [production.product_name]
          );
          
          if (batchToUpdateResult.rows.length > 0) {
            const batch = batchToUpdateResult.rows[0];
            const newQuantity = parseFloat(batch.quantity) - fromInventory;
            
            if (newQuantity <= 0) {
              // Delete batch if quantity would become 0 (constraint requires quantity > 0)
              await client.query(`DELETE FROM inventory_batches WHERE id = $1`, [batch.id]);
            } else {
              // Update batch with new quantity
              await client.query(
                `UPDATE inventory_batches
                 SET quantity = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [newQuantity, batch.id]
              );
            }
          }
        }
      }
      
      // Create allocation record
      const result = await client.query(
        `INSERT INTO salesperson_allocations (production_id, product_id, salesperson_id, batch_number, quantity_allocated, allocation_date, notes, allocated_by)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7)
         RETURNING *`,
        [actualProductionId, productId, salespersonId, batchNumber, qty, notes || null, userId]
      );
      
      // Update inventory batch status (if allocating from production)
      if (!inventoryItemId) {
        await client.query(
          `UPDATE inventory_batches 
           SET status = CASE 
             WHEN (SELECT COALESCE(SUM(quantity_allocated), 0) FROM salesperson_allocations WHERE production_id = $1 AND status = 'active') >= quantity 
             THEN 'allocated' 
             ELSE 'available' 
           END
           WHERE production_id = $1`,
          [actualProductionId]
        );
      }
      
      await client.query('COMMIT');
      
      // Update remaining stock (if allocating from production)
      if (!inventoryItemId) {
        await updateRemainingStock(client, [{ productionId: actualProductionId, productId, quantity: qty }]);
      }
      
      res.status(201).json({ 
        success: true, 
        data: result.rows[0],
        message: 'Salesperson allocation created successfully' 
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating sales allocation:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Helper function to update remaining stock in inventory
async function updateRemainingStock(client, allocations) {
  try {
    // Track which products need inventory recalculation
    const productsToUpdate = new Set();
    
    for (const allocation of allocations) {
      const { productionId, productId } = allocation;
      
      // Get production details
      const prodResult = await client.query(
        `SELECT p.quantity_produced, p.batch, pr.name as product_name
         FROM productions p
         JOIN products pr ON p.product_id = pr.id
         WHERE p.id = $1`,
        [productionId]
      );
      
      if (prodResult.rows.length === 0) continue;
      
      const production = prodResult.rows[0];
      const totalProduced = parseFloat(production.quantity_produced);
      
      // Get total allocated
      const allocatedResult = await client.query(
        `SELECT COALESCE(SUM(quantity_allocated), 0) as total_allocated
         FROM salesperson_allocations
         WHERE production_id = $1 AND status = 'active'`,
        [productionId]
      );
      
      const totalAllocated = parseFloat(allocatedResult.rows[0].total_allocated || 0);
      const remaining = totalProduced - totalAllocated;
      
      // Get finished goods inventory item
      const itemResult = await client.query(
        `SELECT i.id FROM inventory_items i
         JOIN inventory_categories c ON i.category_id = c.id
         WHERE i.name = $1 AND c.name = 'Finished Goods'
         LIMIT 1`,
        [production.product_name]
      );
      
      if (itemResult.rows.length > 0) {
        const itemId = itemResult.rows[0].id;
        productsToUpdate.add(itemId);
        
        if (remaining > 0) {
          // Update or create inventory batch for remaining stock
          await client.query(
            `INSERT INTO inventory_batches (inventory_item_id, production_id, batch_number, quantity, production_date, status)
             VALUES ($1, $2, $3, $4, (SELECT date FROM productions WHERE id = $2), 'available')
             ON CONFLICT (inventory_item_id, batch_number) DO UPDATE
             SET quantity = EXCLUDED.quantity,
                 status = 'available'`,
            [itemId, productionId, production.batch, remaining]
          );
        } else {
          // If all allocated, mark batch as allocated
          await client.query(
            `UPDATE inventory_batches 
             SET status = 'allocated'
             WHERE inventory_item_id = $1 AND batch_number = $2`,
            [itemId, production.batch]
          );
        }
      }
    }
    
    // Recalculate inventory_items.quantity from available batches for each affected product
    for (const itemId of productsToUpdate) {
      const totalAvailableResult = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) as total_available
         FROM inventory_batches
         WHERE inventory_item_id = $1 AND status = 'available'`,
        [itemId]
      );
      
      const totalAvailable = parseFloat(totalAvailableResult.rows[0].total_available || 0);
      
      await client.query(
        `UPDATE inventory_items 
         SET quantity = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [totalAvailable, itemId]
      );
    }
  } catch (error) {
    console.error('Error updating remaining stock:', error);
    throw error;
  }
}

// Get salesperson allocations
export const getSalesAllocations = async (req, res, next) => {
  try {
    const { date, status, salespersonId } = req.query;
    
    let query = `
      SELECT 
        sa.*,
        p.name as product_name,
        pr.date as production_date,
        pr.batch as production_batch,
        u.name as salesperson_name,
        allocator.name as allocated_by_name
      FROM salesperson_allocations sa
      JOIN products p ON sa.product_id = p.id
      JOIN productions pr ON sa.production_id = pr.id
      JOIN users u ON sa.salesperson_id = u.id
      LEFT JOIN users allocator ON sa.allocated_by = allocator.id
      WHERE 1=1
    `;
    
    const params = [];
    if (date) {
      params.push(date);
      query += ` AND sa.allocation_date = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND sa.status = $${params.length}`;
    }
    if (salespersonId) {
      params.push(salespersonId);
      query += ` AND sa.salesperson_id = $${params.length}`;
    }
    
    query += ' ORDER BY sa.allocation_date DESC, sa.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get salesperson's allocated inventory (grouped by product)
export const getSalespersonInventory = async (req, res, next) => {
  try {
    const salespersonId = req.user?.userId;
    
    if (!salespersonId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Salesperson ID not found'
      });
    }

    // Get all active allocations for this salesperson, grouped by product
    // Products don't have a unit column, so we default to 'piece'
    const result = await pool.query(`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.selling_price as price,
        'piece' as unit,
        COALESCE(SUM(CASE WHEN sa.status = 'active' THEN sa.quantity_allocated ELSE 0 END), 0) as stock
      FROM salesperson_allocations sa
      JOIN products p ON sa.product_id = p.id
      WHERE sa.salesperson_id = $1
      GROUP BY p.id, p.name, p.selling_price
      HAVING COALESCE(SUM(CASE WHEN sa.status = 'active' THEN sa.quantity_allocated ELSE 0 END), 0) > 0
      ORDER BY p.name
    `, [salespersonId]);
    
    res.json({ 
      success: true, 
      data: result.rows.map(row => ({
        id: row.product_id,
        name: row.product_name,
        unit: row.unit || 'piece',
        stock: parseFloat(row.stock || 0),
        price: parseFloat(row.price || 0)
      }))
    });
  } catch (error) {
    console.error('Error getting salesperson inventory:', error);
    next(error);
  }
};

// Get today's production with allocation summary
export const getTodayProductionWithAllocations = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(`
      SELECT 
        p.id as production_id,
        p.date as production_date,
        p.batch,
        p.quantity_produced,
        p.notes,
        pr.id as product_id,
        pr.name as product_name,
        pr.category as product_category,
        COALESCE(SUM(CASE WHEN sa.status = 'active' THEN sa.quantity_allocated ELSE 0 END), 0) as total_allocated,
        (p.quantity_produced - COALESCE(SUM(CASE WHEN sa.status = 'active' THEN sa.quantity_allocated ELSE 0 END), 0)) as remaining_quantity,
        COUNT(DISTINCT CASE WHEN sa.status = 'active' THEN sa.salesperson_id END) as salesperson_count,
        json_agg(
          json_build_object(
            'allocation_id', sa.id,
            'salesperson_id', sa.salesperson_id,
            'salesperson_name', u.name,
            'quantity_allocated', sa.quantity_allocated,
            'allocation_date', sa.allocation_date,
            'status', sa.status
          ) ORDER BY sa.created_at
        ) FILTER (WHERE sa.id IS NOT NULL) as allocations
      FROM productions p
      JOIN products pr ON p.product_id = pr.id
      LEFT JOIN salesperson_allocations sa ON p.id = sa.production_id
      LEFT JOIN users u ON sa.salesperson_id = u.id
      WHERE p.date = $1
      GROUP BY p.id, p.date, p.batch, p.quantity_produced, p.notes, pr.id, pr.name, pr.category
      ORDER BY pr.name, p.created_at DESC
    `, [today]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getting today production with allocations:', error);
    next(error);
  }
};

// Get single production
export const getProductionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        p.*,
        pr.name as product_name,
        pr.category as product_category
      FROM productions p
      JOIN products pr ON p.product_id = pr.id
      WHERE p.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Production not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};
