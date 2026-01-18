// Returns Controller
import pool from '../config/db.js';

// Get all returns
export const getAllReturns = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.id,
        r.sale_id as original_sale_id,
        r.product_id,
        r.quantity,
        r.reason,
        r.replacement_given,
        r.replacement_product_id,
        r.replacement_quantity,
        r.processed_by,
        r.created_at,
        s.id as sale_id,
        COALESCE(p.name, i.name) as product_name,
        b.shop_name
      FROM returns r
      LEFT JOIN sales s ON r.sale_id = s.id
      LEFT JOIN products p ON r.product_id = p.id
      LEFT JOIN inventory_items i ON r.product_id = i.id
      LEFT JOIN buyers b ON s.buyer_id = b.id
      ORDER BY r.created_at DESC
    `);
    
    // Return individual return records (not grouped)
    const formattedData = result.rows.map(row => ({
      id: row.id,
      date: row.created_at,
      originalSaleId: row.original_sale_id || row.sale_id,
      productId: row.product_id,
      productName: row.product_name || 'Unknown Product',
      quantity: parseFloat(row.quantity || 0),
      reason: row.reason,
      replacementGiven: row.replacement_given,
      replacementProductId: row.replacement_product_id,
      replacementQuantity: row.replacement_quantity ? parseFloat(row.replacement_quantity) : null,
      createdAt: row.created_at,
      createdBy: row.processed_by,
      shopName: row.shop_name || null
    }));
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    next(error);
  }
};

// Get single return
export const getReturnById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT r.*, s.id as sale_id, p.name as product_name
      FROM returns r
      LEFT JOIN sales s ON r.sale_id = s.id
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Return not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create return
export const createReturn = async (req, res, next) => {
  try {
    const { originalSaleId, date, reason, settlementStatus, items, notes } = req.body;
    const userId = req.user.userId;
    
    if (!originalSaleId || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Sale ID and at least one item are required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get sale info to find salesperson
      const saleResult = await client.query('SELECT salesperson_id FROM sales WHERE id = $1', [originalSaleId]);
      if (saleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }
      const salespersonId = saleResult.rows[0].salesperson_id;
      
      // Create return records for each item and adjust inventory
      const returnRecords = [];
      for (const item of items) {
        const productId = item.inventoryItemId || item.productId;
        const returnQuantity = parseFloat(item.quantity || 0);
        const replacementProductId = item.replacementItemId || null;
        const replacementQuantity = item.replacementQuantity ? parseFloat(item.replacementQuantity) : null;
        
        // Create return record
        const result = await client.query(
          `INSERT INTO returns (sale_id, product_id, quantity, reason, replacement_given, replacement_product_id, replacement_quantity, processed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            originalSaleId,
            productId,
            returnQuantity,
            reason || null,
            replacementProductId ? true : false,
            replacementProductId,
            replacementQuantity,
            userId
          ]
        );
        returnRecords.push(result.rows[0]);
        
        // Add returned items back to salesperson's allocation
        if (returnQuantity > 0) {
          // Check if there's an active allocation for this product
          const existingAllocationResult = await client.query(`
            SELECT id, quantity_allocated, batch_number, production_id
            FROM salesperson_allocations
            WHERE salesperson_id = $1 
            AND product_id = $2 
            AND status = 'active'
            ORDER BY allocation_date ASC, created_at ASC
            LIMIT 1
          `, [salespersonId, productId]);
          
          if (existingAllocationResult.rows.length > 0) {
            // Update existing allocation
            await client.query(`
              UPDATE salesperson_allocations
              SET quantity_allocated = quantity_allocated + $1,
                  status = 'active'
              WHERE id = $2
            `, [returnQuantity, existingAllocationResult.rows[0].id]);
          } else {
            // Find the most recent production for this product to link allocation
            const productionResult = await client.query(`
              SELECT id, date, batch
              FROM productions
              WHERE product_id = $1
              ORDER BY date DESC, created_at DESC
              LIMIT 1
            `, [productId]);
            
            if (productionResult.rows.length > 0) {
              const production = productionResult.rows[0];
              // Create new allocation linked to the production
              await client.query(`
                INSERT INTO salesperson_allocations (
                  production_id, product_id, salesperson_id, batch_number, 
                  quantity_allocated, allocation_date, status
                )
                VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'active')
              `, [
                production.id,
                productId,
                salespersonId,
                production.batch || `RET-${new Date().toISOString().split('T')[0]}`,
                returnQuantity
              ]);
            }
          }
        }
        
        // If replacement is given, deduct from salesperson's allocation
        if (replacementProductId && replacementQuantity && replacementQuantity > 0) {
          // Check available stock
          const availableStockResult = await client.query(`
            SELECT COALESCE(SUM(quantity_allocated), 0) as available_stock
            FROM salesperson_allocations
            WHERE salesperson_id = $1 
            AND product_id = $2 
            AND status = 'active'
          `, [salespersonId, replacementProductId]);
          
          const availableStock = parseFloat(availableStockResult.rows[0].available_stock || 0);
          if (availableStock < replacementQuantity) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for replacement. Available: ${availableStock.toFixed(2)}, Required: ${replacementQuantity.toFixed(2)}`
            });
          }
          
          // Deduct replacement quantity using FIFO
          let remainingToDeduct = replacementQuantity;
          const allocationsResult = await client.query(`
            SELECT id, quantity_allocated
            FROM salesperson_allocations
            WHERE salesperson_id = $1 
            AND product_id = $2 
            AND status = 'active'
            ORDER BY allocation_date ASC, created_at ASC
          `, [salespersonId, replacementProductId]);
          
          for (const allocation of allocationsResult.rows) {
            if (remainingToDeduct <= 0) break;
            
            const allocationQty = parseFloat(allocation.quantity_allocated || 0);
            const deductAmount = Math.min(remainingToDeduct, allocationQty);
            
            if (deductAmount >= allocationQty) {
              // Mark allocation as sold
              await client.query(`
                UPDATE salesperson_allocations
                SET status = 'sold'
                WHERE id = $1
              `, [allocation.id]);
            } else {
              // Reduce allocation quantity
              await client.query(`
                UPDATE salesperson_allocations
                SET quantity_allocated = quantity_allocated - $1
                WHERE id = $2
              `, [deductAmount, allocation.id]);
            }
            
            remainingToDeduct -= deductAmount;
          }
        }
      }
      
      await client.query('COMMIT');
      
      // Format response to match frontend expectations
      const responseData = {
        id: returnRecords[0].id,
        date: date || returnRecords[0].created_at,
        originalSaleId: originalSaleId,
        reason: reason || null,
        settlementStatus: settlementStatus || 'pending',
        notes: notes || null,
        createdAt: returnRecords[0].created_at,
        createdBy: userId,
        items: returnRecords.map(r => ({
          id: r.id,
          returnId: r.id,
          inventoryItemId: r.product_id,
          quantity: parseFloat(r.quantity),
          replacementItemId: r.replacement_product_id || null,
          replacementQuantity: r.replacement_quantity ? parseFloat(r.replacement_quantity) : null
        }))
      };
      
      res.status(201).json({ success: true, data: responseData, message: 'Return created successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

// Delete return
export const deleteReturn = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if return exists
    const checkResult = await pool.query('SELECT id FROM returns WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Return not found' });
    }
    
    // Delete the return
    await pool.query('DELETE FROM returns WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Return deleted successfully' });
  } catch (error) {
    next(error);
  }
};

