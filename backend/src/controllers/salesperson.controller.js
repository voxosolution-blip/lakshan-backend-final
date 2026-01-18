// Salesperson Mobile Controller - Professional ERP Implementation
import pool from '../config/db.js';

// ============================================
// LOCATION TRACKING
// ============================================

// Update salesperson location
export const updateLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, status } = req.body;
    const salespersonId = req.user.userId;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Upsert location (using user_id column)
    const result = await pool.query(
      `INSERT INTO salesperson_locations (user_id, latitude, longitude, accuracy, last_updated)
       VALUES ($1, $2, $3, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         last_updated = CURRENT_TIMESTAMP
       RETURNING *`,
      [salespersonId, latitude, longitude]
    );

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

// Get salesperson current location
export const getMyLocation = async (req, res, next) => {
  try {
    const salespersonId = req.user.userId;
    const result = await pool.query(
      `SELECT * FROM salesperson_locations WHERE user_id = $1`,
      [salespersonId]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    next(error);
  }
};

// Get all salesperson locations (Admin only)
export const getAllLocations = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        sl.*,
        u.name as salesperson_name,
        u.username,
        u.id as salesperson_id
       FROM salesperson_locations sl
       JOIN users u ON sl.user_id = u.id
       WHERE u.role = 'SALESPERSON' AND u.is_active = true
       ORDER BY sl.last_updated DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SHOPS MANAGEMENT
// ============================================

// Get all shops for salesperson (with pending payment info)
export const getMyShops = async (req, res, next) => {
  try {
    const salespersonId = req.user.userId;

    const result = await pool.query(
      `SELECT 
        b.id,
        b.shop_name,
        b.contact,
        b.address,
        b.latitude,
        b.longitude,
        b.is_active,
        COALESCE(pending.total_ongoing, 0) as pending_ongoing,
        COALESCE(pending.total_pending_cheques, 0) as pending_cheques,
        COALESCE(pending.pending_cheque_count, 0) as pending_cheque_count,
        pending.latest_cheque_date,
        pending.latest_cheque_expiry
       FROM buyers b
       LEFT JOIN (
         SELECT 
           s.buyer_id,
           SUM(p.ongoing_amount) as total_ongoing,
           SUM(CASE WHEN c.status = 'pending' THEN c.amount ELSE 0 END) as total_pending_cheques,
           COUNT(DISTINCT CASE WHEN c.status = 'pending' THEN c.id END) as pending_cheque_count,
           MAX(c.cheque_date) as latest_cheque_date,
           MAX(c.return_date) as latest_cheque_expiry
         FROM sales s
         LEFT JOIN payments p ON s.id = p.sale_id
         LEFT JOIN cheques c ON p.id = c.payment_id
         WHERE s.salesperson_id = $1 AND p.status != 'cancelled'
         GROUP BY s.buyer_id
       ) pending ON b.id = pending.buyer_id
       WHERE b.is_active = true
       ORDER BY b.shop_name`,
      [salespersonId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Add new shop
export const addShop = async (req, res, next) => {
  try {
    const { shopName, contact, address, latitude, longitude } = req.body;

    if (!shopName) {
      return res.status(400).json({
        success: false,
        message: 'Shop name is required'
      });
    }

    const result = await pool.query(
      `INSERT INTO buyers (shop_name, contact, address, latitude, longitude, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [
        shopName,
        contact || null,
        address || null,
        latitude || null,
        longitude || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Shop added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

// Update shop location
export const updateShopLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const result = await pool.query(
      `UPDATE buyers 
       SET latitude = $1, longitude = $2
       WHERE id = $3
       RETURNING *`,
      [latitude, longitude, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    res.json({
      success: true,
      message: 'Shop location updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// INVENTORY ALLOCATION (with Batch Info)
// ============================================

// Get my allocated inventory with batch details
export const getMyInventory = async (req, res, next) => {
  try {
    const salespersonId = req.user.userId;

    // Get all active allocations grouped by product and batch
    // Calculate available quantity = allocated - sold
    const result = await pool.query(
      `SELECT 
        sa.product_id,
        sa.batch_number,
        pr.name as product_name,
        pr.selling_price,
        pr.category,
        p.date as production_date,
        SUM(sa.quantity_allocated) as total_allocated,
        COALESCE(SUM(sold.sold_quantity), 0) as sold_quantity,
        COALESCE(SUM(returned.returned_quantity), 0) as returned_quantity,
        GREATEST(0, SUM(sa.quantity_allocated) - COALESCE(SUM(sold.sold_quantity), 0)) as available_quantity
       FROM salesperson_allocations sa
       JOIN products pr ON sa.product_id = pr.id
       JOIN productions p ON sa.production_id = p.id
       LEFT JOIN (
         -- Calculate sold quantities per product (sales don't track batch, so distribute proportionally)
         SELECT 
           si.product_id,
           SUM(si.quantity) as sold_quantity
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         WHERE s.salesperson_id = $1 AND si.is_return = false
         GROUP BY si.product_id
       ) sold ON sold.product_id = sa.product_id
       LEFT JOIN (
         -- Calculate returned quantities per product
         SELECT 
           si.product_id,
           SUM(si.quantity) as returned_quantity
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         WHERE s.salesperson_id = $1 AND si.is_return = true
         GROUP BY si.product_id
       ) returned ON returned.product_id = sa.product_id
       WHERE sa.salesperson_id = $1 
         AND sa.status = 'active'
         AND pr.is_active = true
       GROUP BY sa.product_id, sa.batch_number, pr.name, pr.selling_price, pr.category, p.date
       HAVING SUM(sa.quantity_allocated) > 0
       ORDER BY pr.name, sa.batch_number DESC`,
      [salespersonId]
    );

    // Process to distribute sold/returned quantities proportionally across batches
    const inventoryByProduct = {};
    
    result.rows.forEach((row) => {
      const key = row.product_id;
      if (!inventoryByProduct[key]) {
        inventoryByProduct[key] = {
          product_id: row.product_id,
          product_name: row.product_name,
          selling_price: parseFloat(row.selling_price || 0),
          category: row.category,
          total_allocated: 0,
          total_sold: parseFloat(row.sold_quantity || 0),
          total_returned: parseFloat(row.returned_quantity || 0),
          batches: []
        };
      }
      
      inventoryByProduct[key].total_allocated += parseFloat(row.total_allocated || 0);
      inventoryByProduct[key].batches.push({
        batch_number: row.batch_number,
        production_date: row.production_date,
        allocated: parseFloat(row.total_allocated || 0),
        sold: 0, // Will be calculated proportionally below
        returned: 0, // Will be calculated proportionally below
        available: parseFloat(row.total_allocated || 0)
      });
    });

    // Calculate proportional distribution of sold/returned across batches
    const finalInventory = Object.values(inventoryByProduct).map((product) => {
      product.batches = product.batches.map((batch) => {
        if (product.total_allocated > 0) {
          const proportion = batch.allocated / product.total_allocated;
          batch.sold = Math.min(product.total_sold * proportion, batch.allocated);
          batch.returned = Math.min(product.total_returned * proportion, batch.allocated);
          batch.available = Math.max(0, batch.allocated - batch.sold + batch.returned);
        }
        return batch;
      });
      
      // Calculate totals across all batches
      const totalAvailable = product.batches.reduce((sum, b) => sum + b.available, 0);
      const totalSold = product.batches.reduce((sum, b) => sum + b.sold, 0);
      const totalReturned = product.batches.reduce((sum, b) => sum + b.returned, 0);
      
      return {
        ...product,
        total_available: totalAvailable,
        total_sold: totalSold,
        total_returned: totalReturned
      };
    });

    res.json({ success: true, data: finalInventory });
  } catch (error) {
    console.error('Error getting salesperson inventory:', error);
    next(error);
  }
};

// ============================================
// SALES WITH MULTI-PAYMENT & RETURNS
// ============================================

// Create sale with multi-payment and returns
export const createMobileSale = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      shopId,
      saleItems,
      returnItems,
      payment
    } = req.body;
    const salespersonId = req.user.userId;

    if (!shopId) {
      return res.status(400).json({
        success: false,
        message: 'Shop ID is required'
      });
    }

    if (!saleItems || saleItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one sale item is required'
      });
    }

    await client.query('BEGIN');

    // Calculate total amount from sale items only (returns are free)
    let totalAmount = 0;
    for (const item of saleItems) {
      totalAmount += item.quantity * item.price;
    }

    // Create sale record
    const saleResult = await client.query(
      `INSERT INTO sales (buyer_id, salesperson_id, date, total_amount, payment_status, notes)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
       RETURNING *`,
      [
        shopId,
        salespersonId,
        totalAmount,
        payment.ongoing_amount > 0 ? 'partial' : 'paid',
        null
      ]
    );

    const saleId = saleResult.rows[0].id;

    // Process sale items
    for (const item of saleItems) {
      // Insert sale item
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, price, is_return)
         VALUES ($1, $2, $3, $4, false)`,
        [saleId, item.productId, item.quantity, item.price]
      );

      // Update allocation status (mark as sold proportionally)
      // Since we don't track which batch was sold, we use FIFO (oldest batch first)
      const allocationResult = await client.query(
        `SELECT id, quantity_allocated
         FROM salesperson_allocations
         WHERE salesperson_id = $1 
           AND product_id = $2 
           AND status = 'active'
         ORDER BY allocation_date ASC, created_at ASC
         FOR UPDATE`,
        [salespersonId, item.productId]
      );

      let remainingToDeduct = parseFloat(item.quantity);
      for (const allocation of allocationResult.rows) {
        if (remainingToDeduct <= 0) break;
        
        const allocQty = parseFloat(allocation.quantity_allocated);
        const toDeduct = Math.min(remainingToDeduct, allocQty);
        
        if (toDeduct >= allocQty) {
          // Fully sold, mark as completed
          await client.query(
            `UPDATE salesperson_allocations 
             SET status = 'completed', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [allocation.id]
          );
        } else {
          // Partially sold - create a new allocation for remaining quantity
          await client.query(
            `UPDATE salesperson_allocations 
             SET quantity_allocated = quantity_allocated - $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [toDeduct, allocation.id]
          );
        }
        
        remainingToDeduct -= toDeduct;
      }
    }

    // Process return items (if any) - FREE returns
    if (returnItems && returnItems.length > 0) {
      for (const item of returnItems) {
        // Insert return item with price = 0
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, price, is_return)
           VALUES ($1, $2, $3, 0, true)`,
          [saleId, item.productId, item.quantity]
        );

        // Add returned stock back to the most recent active allocation (LIFO)
        const allocationResult = await client.query(
          `SELECT id, quantity_allocated, batch_number, production_id
           FROM salesperson_allocations
           WHERE salesperson_id = $1 
             AND product_id = $2 
             AND status = 'active'
           ORDER BY allocation_date DESC, created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [salespersonId, item.productId]
        );

        if (allocationResult.rows.length > 0) {
          const allocation = allocationResult.rows[0];
          await client.query(
            `UPDATE salesperson_allocations 
             SET quantity_allocated = quantity_allocated + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [item.quantity, allocation.id]
          );
        } else {
          // No active allocation found - this shouldn't happen, but create a note
          console.warn(`Return for product ${item.productId} but no active allocation found`);
        }
      }
    }

    // Create payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (sale_id, cash_amount, cheque_amount, ongoing_amount, status, payment_date)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
       RETURNING *`,
      [
        saleId,
        payment.cash_amount || 0,
        payment.cheque_amount || 0,
        payment.ongoing_amount || 0,
        payment.ongoing_amount > 0 ? 'pending' : 'completed'
      ]
    );

    const paymentId = paymentResult.rows[0].id;

    // Add cheque details (if any) - these will show in admin Cheques panel
    if (payment.cheques && payment.cheques.length > 0) {
      for (const cheque of payment.cheques) {
        await client.query(
          `INSERT INTO cheques (payment_id, cheque_number, bank_name, cheque_date, return_date, amount, status, notes)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, 'pending', $6)`,
          [
            paymentId,
            cheque.chequeNumber,
            cheque.bankName || null,
            cheque.expiryDate || null, // expiry date -> return_date
            cheque.amount,
            cheque.notes || 'From Salesperson Mobile'
          ]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Sale created successfully',
      data: {
        sale: saleResult.rows[0],
        payment: paymentResult.rows[0]
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating mobile sale:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Get shop sale history
export const getShopSales = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const salespersonId = req.user.userId;

    const result = await pool.query(
      `SELECT 
        s.*,
        p.cash_amount,
        p.cheque_amount,
        p.ongoing_amount,
        p.status as payment_status
       FROM sales s
       LEFT JOIN payments p ON s.id = p.sale_id
       WHERE s.buyer_id = $1 AND s.salesperson_id = $2
       ORDER BY s.date DESC, s.created_at DESC
       LIMIT 20`,
      [shopId, salespersonId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};
