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
    
    // Generate production date
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
    
    // Create production record FIRST (before deducting inventory)
    // This ensures milk calculation includes this production
    const productionResult = await client.query(
      `INSERT INTO productions (product_id, quantity_produced, date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [productId, quantity, productionDate, notes || null, userId]
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
    
    // Directly update finished goods inventory (no batch tracking)
    await client.query(
      `UPDATE inventory_items 
       SET quantity = quantity + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [quantity, finishedGoodsItemId]
    );
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      data: {
        ...production,
        product: product,
        finishedGoodsItemId: finishedGoodsItemId
      },
      message: `Production created successfully. Inventory deducted and finished goods added to inventory.` 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating production:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Create salesperson allocation from inventory only (no production batches)
export const createSalesAllocation = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { inventoryItemId, productId, salespersonId, quantityAllocated, notes, allocations } = req.body;
    const userId = req.user?.userId;
    
    // Support both single allocation and bulk allocations
    if (allocations && Array.isArray(allocations)) {
      // Bulk allocation mode
      await client.query('BEGIN');
      
      const results = [];
      for (const allocation of allocations) {
        const { inventoryItemId: invItemId, productId: prodProdId, salespersonId: salesId, quantity } = allocation;
        
        if (!invItemId || !prodProdId || !salesId || !quantity || quantity <= 0) {
          throw new Error('Invalid allocation data: Inventory Item ID, Product ID, Salesperson ID, and quantity are required');
        }
        
        // Get inventory item and product details
        const inventoryResult = await client.query(
          `SELECT i.*, pr.name as product_name, pr.id as product_id
           FROM inventory_items i
           JOIN inventory_categories c ON i.category_id = c.id
           JOIN products pr ON i.name = pr.name
           WHERE i.id = $1 AND pr.id = $2 AND c.name = 'Finished Goods'
           LIMIT 1`,
          [invItemId, prodProdId]
        );
        
        if (inventoryResult.rows.length === 0) {
          throw new Error(`Inventory item not found or does not match product`);
        }
        
      const inventoryItem = inventoryResult.rows[0];
      const availableStock = parseFloat(inventoryItem.quantity || 0);
      const qty = parseFloat(quantity);
      
      if (qty > availableStock) {
        throw new Error(`Insufficient stock for ${inventoryItem.product_name}. Available: ${availableStock.toFixed(2)}, Requested: ${qty.toFixed(2)}`);
      }
      
      // Reduce inventory stock
      await client.query(
        `UPDATE inventory_items 
         SET quantity = GREATEST(0, quantity - $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [qty, invItemId]
      );
      
      // Create allocation record (no production_id or batch_number - sourced directly from inventory)
      const allocationResult = await client.query(
        `INSERT INTO salesperson_allocations (product_id, salesperson_id, quantity_allocated, allocation_date, notes, allocated_by)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)
         RETURNING *`,
        [prodProdId, salesId, qty, notes || null, userId]
      );
      
      results.push(allocationResult.rows[0]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        success: true, 
        data: results,
        message: `${results.length} allocation(s) created successfully` 
      });
    } else {
      // Single allocation mode
      if (!inventoryItemId || !productId || !salespersonId || !quantityAllocated || quantityAllocated <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Inventory Item ID, Product ID, Salesperson ID, and quantity are required' 
        });
      }
      
      await client.query('BEGIN');
      
      const qty = parseFloat(quantityAllocated);
      
      // Get inventory item and verify it matches the product
      const inventoryResult = await client.query(
        `SELECT i.*, pr.name as product_name, pr.id as product_id
         FROM inventory_items i
         JOIN inventory_categories c ON i.category_id = c.id
         JOIN products pr ON i.name = pr.name
         WHERE i.id = $1 AND pr.id = $2 AND c.name = 'Finished Goods'
         LIMIT 1`,
        [inventoryItemId, productId]
      );
      
      if (inventoryResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: 'Inventory item not found or does not match the selected product' 
        });
      }
      
      const inventoryItem = inventoryResult.rows[0];
      const availableStock = parseFloat(inventoryItem.quantity || 0);
      
      if (qty > availableStock) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient inventory stock. Available: ${availableStock.toFixed(2)}, Requested: ${qty.toFixed(2)}` 
        });
      }
      
      // Reduce inventory stock directly
      await client.query(
        `UPDATE inventory_items 
         SET quantity = GREATEST(0, quantity - $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [qty, inventoryItemId]
      );
      
      // Create allocation record (no production_id or batch_number - sourced directly from inventory)
      const allocationResult = await client.query(
        `INSERT INTO salesperson_allocations (product_id, salesperson_id, quantity_allocated, allocation_date, notes, allocated_by)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)
         RETURNING *`,
        [productId, salespersonId, qty, notes || null, userId]
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        success: true, 
        data: allocationResult.rows[0],
        message: 'Allocation created successfully' 
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
        u.name as salesperson_name,
        allocator.name as allocated_by_name
      FROM salesperson_allocations sa
      JOIN products p ON sa.product_id = p.id
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
        p.quantity_produced,
        p.notes,
        pr.id as product_id,
        pr.name as product_name,
        pr.category as product_category,
        -- Get current inventory stock for this product (from finished goods)
        COALESCE((
          SELECT i.quantity
          FROM inventory_items i
          JOIN inventory_categories c ON i.category_id = c.id
          WHERE i.name = pr.name AND c.name = 'Finished Goods'
          LIMIT 1
        ), 0) as current_inventory_stock
      FROM productions p
      JOIN products pr ON p.product_id = pr.id
      WHERE p.date = $1
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
