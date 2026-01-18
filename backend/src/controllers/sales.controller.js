// Sales Controller
import pool from '../config/db.js';

// Get all sales
export const getAllSales = async (req, res, next) => {
  try {
    const { startDate, endDate, buyerId, salespersonId } = req.query;
    const userId = req.user?.userId;
    const userRole = req.user?.role?.toUpperCase();
    const isAdmin = userRole === 'ADMIN';
    
    let query = `
      SELECT s.*, s.buyer_id, 
             b.shop_name as buyer_name, b.address as buyer_address, b.contact as buyer_contact,
             u.name as salesperson_name, u.username as salesperson_username
      FROM sales s
      LEFT JOIN buyers b ON s.buyer_id = b.id
      LEFT JOIN users u ON s.salesperson_id = u.id
      WHERE s.is_reversed = false
    `;
    const params = [];
    
    // Filter by salesperson_id only if explicitly requested via query parameter
    // Removed automatic filtering - users can filter manually if needed
    if (salespersonId && salespersonId !== 'all') {
      params.push(salespersonId);
      query += ` AND s.salesperson_id = $${params.length}`;
    }
    // Note: Removed automatic salesperson filtering to allow manual filtering
    
    if (buyerId) {
      params.push(buyerId);
      query += ` AND s.buyer_id = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      query += ` AND s.date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND s.date <= $${params.length}`;
    }
    
    query += ' ORDER BY s.date DESC, s.created_at DESC';
    
    const result = await pool.query(query, params);
    
    // Get payment summaries for each sale
    const saleIds = result.rows.map(row => row.id);
    const paymentSummaries = {};
    const pendingAmounts = {};
    
    // Store payment methods per sale
    const paymentMethodsBySale = {};
    
    if (saleIds.length > 0) {
      // Get total paid amount per sale and detect payment methods
      const paymentResult = await pool.query(`
        SELECT 
          p.sale_id,
          COALESCE(SUM(CASE WHEN c.status = 'cleared' THEN p.cash_amount ELSE 0 END), 0) as paid_cash,
          COALESCE(SUM(CASE WHEN c.status = 'cleared' THEN p.cheque_amount ELSE 0 END), 0) as paid_cheque_cleared,
          COALESCE(SUM(CASE WHEN c.status IS NULL OR c.status != 'cleared' THEN p.cheque_amount ELSE 0 END), 0) as pending_cheque,
          -- Check if any payment has ongoing payment method in notes
          BOOL_OR(
            p.notes IS NOT NULL AND p.notes::text LIKE '%"paymentMethod":"ongoing"%'
          ) as has_ongoing_payment
        FROM payments p
        LEFT JOIN cheques c ON c.payment_id = p.id
        WHERE p.sale_id = ANY($1) AND p.status = 'completed'
        GROUP BY p.sale_id
      `, [saleIds]);
      
      paymentResult.rows.forEach(row => {
        const totalPaid = parseFloat(row.paid_cash || 0) + parseFloat(row.paid_cheque_cleared || 0);
        paymentSummaries[row.sale_id] = totalPaid;
        pendingAmounts[row.sale_id] = {
          cash: 0,
          cheque: parseFloat(row.pending_cheque || 0)
        };
        
        // Store payment method for this sale
        if (row.has_ongoing_payment) {
          paymentMethodsBySale[row.sale_id] = 'ongoing';
        }
      });
    }
    
    // Get sale items with product names for each sale
    const saleItemsMap = {};
    if (saleIds.length > 0) {
      const itemsResult = await pool.query(`
        SELECT 
          si.sale_id,
          si.product_id,
          si.quantity,
          si.price,
          si.free_quantity,
          p.name as product_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ANY($1)
        ORDER BY si.sale_id, si.created_at
      `, [saleIds]);
      
      itemsResult.rows.forEach(item => {
        if (!saleItemsMap[item.sale_id]) {
          saleItemsMap[item.sale_id] = [];
        }
        saleItemsMap[item.sale_id].push({
          productId: item.product_id,
          productName: item.product_name || 'Unknown Product',
          quantity: parseFloat(item.quantity || 0),
          price: parseFloat(item.price || 0),
          freeQuantity: parseFloat(item.free_quantity || 0),
          isReturn: false
        });
      });
    }
    
    // Get returns for each sale
    const saleReturnsMap = {};
    if (saleIds.length > 0) {
      const returnsResult = await pool.query(`
        SELECT 
          r.sale_id,
          r.product_id,
          r.quantity,
          r.reason,
          r.created_at,
          p.name as product_name
        FROM returns r
        LEFT JOIN products p ON r.product_id = p.id
        WHERE r.sale_id = ANY($1)
        ORDER BY r.sale_id, r.created_at DESC
      `, [saleIds]);
      
      returnsResult.rows.forEach(ret => {
        if (!saleReturnsMap[ret.sale_id]) {
          saleReturnsMap[ret.sale_id] = [];
        }
        saleReturnsMap[ret.sale_id].push({
          productId: ret.product_id,
          productName: ret.product_name || 'Unknown Product',
          quantity: parseFloat(ret.quantity || 0),
          reason: ret.reason || null,
          returnDate: ret.created_at
        });
      });
    }
    
    // Format response to match frontend expectations
    const formattedData = result.rows.map(row => {
      const saleTotal = parseFloat(row.total_amount || 0);
      const totalPaid = paymentSummaries[row.id] || 0;
      const pending = pendingAmounts[row.id] || { cash: 0, cheque: 0 };
      const remainingBalance = saleTotal - totalPaid - pending.cheque;
      
      // Check if there are payment records for this sale
      const hasPaymentRecords = totalPaid > 0 || pending.cheque > 0;
      
      // Pending cash logic:
      // - If there are payment records, pendingCash = 0 (cash payments are immediately marked as paid)
      // - If there are NO payment records (ongoing sale), pendingCash = remaining amount
      const pendingCash = hasPaymentRecords ? 0 : Math.max(0, remainingBalance);
      
      return {
        id: row.id,
        date: row.date,
        route: row.buyer_address || null,
        address: row.buyer_address || null,
        customerName: row.buyer_name || null,
        contact: row.buyer_contact || null,
        totalAmount: saleTotal,
        totalPaid: totalPaid,
        pendingAmount: remainingBalance + pending.cheque,
        pendingCash: pendingCash,
        pendingCheque: pending.cheque,
        paymentStatus: row.payment_status || 'pending',
        paymentMethod: paymentMethodsBySale[row.id] || null,
        notes: row.notes || null,
        createdAt: row.created_at,
        createdBy: row.salesperson_id,
        buyerId: row.buyer_id || null, // Add buyerId for proper shop grouping (from s.buyer_id)
        salespersonName: row.salesperson_name || row.salesperson_username || null, // Add salesperson name for admin view
        items: saleItemsMap[row.id] || [],
        returns: saleReturnsMap[row.id] || [],
        isEdited: row.is_edited || false,
        isReversed: row.is_reversed || false
      };
    });
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    next(error);
  }
};

// Get single sale
export const getSaleById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const saleResult = await pool.query(`
      SELECT s.*, b.shop_name as buyer_name, b.address as buyer_address
      FROM sales s
      LEFT JOIN buyers b ON s.buyer_id = b.id
      WHERE s.id = $1
    `, [id]);
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    
      const itemsResult = await pool.query(`
        SELECT si.*, p.name as product_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = $1
      `, [id]);
      
      // Format items to match frontend expectations (camelCase)
      const formattedItems = itemsResult.rows.map(item => ({
        id: item.id,
        saleId: item.sale_id,
        productId: item.product_id,
        productName: item.product_name || 'Unknown Product',
        quantity: parseFloat(item.quantity || 0),
        price: parseFloat(item.price || 0),
        unitPrice: parseFloat(item.price || 0),
        freeQuantity: parseFloat(item.free_quantity || 0)
      }));
    
    const row = saleResult.rows[0];
    res.json({ 
      success: true, 
      data: { 
        ...row,
        route: row.buyer_address || null,
        address: row.buyer_address || null,
        customerName: row.buyer_name || null,
        totalAmount: parseFloat(row.total_amount || 0),
        items: formattedItems
      } 
    });
  } catch (error) {
    next(error);
  }
};

// Create sale
export const createSale = async (req, res, next) => {
  try {
    const { buyerId, date, route, customerName, paymentMethod, paymentStatus, items, notes } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role?.toUpperCase();
    
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Calculate total (free items are additional, not subtracted from quantity)
      let totalAmount = 0;
      for (const item of items) {
        const price = item.unitPrice || item.price || 0;
        const quantity = item.quantity || 0;
        // Charge for the quantity sold (free items are extra, given as reward)
        totalAmount += price * quantity;
      }
      
      // Find or create buyer if customerName is provided
      let buyer_id = buyerId || null;
      if (customerName && !buyer_id) {
        const buyerResult = await client.query(
          'SELECT id FROM buyers WHERE shop_name = $1 LIMIT 1',
          [customerName]
        );
        if (buyerResult.rows.length > 0) {
          buyer_id = buyerResult.rows[0].id;
        } else {
          // Create new buyer
          const newBuyerResult = await client.query(
            'INSERT INTO buyers (shop_name, is_active) VALUES ($1, true) RETURNING id',
            [customerName]
          );
          buyer_id = newBuyerResult.rows[0].id;
        }
      }
      
      // Create sale
      const saleResult = await client.query(
        `INSERT INTO sales (buyer_id, salesperson_id, date, total_amount, payment_status, notes)
         VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6)
         RETURNING *`,
        [buyer_id, userId, date, totalAmount, paymentStatus || 'pending', notes || null]
      );
      
      const saleId = saleResult.rows[0].id;
      
      // Create sale items - map to products and deduct from salesperson allocations
      for (const item of items) {
        // The inventoryItemId from frontend is actually a product_id from salesperson inventory
        // First, try to use it directly as product_id
        let productId = item.inventoryItemId || item.productId;
        
        // Verify it's a valid product
        const productCheck = await client.query(
          'SELECT id, name FROM products WHERE id = $1',
          [productId]
        );
        
        if (productCheck.rows.length === 0) {
          // If not found as product, try to find by inventory item name
          const inventoryResult = await client.query(
            'SELECT name FROM inventory_items WHERE id = $1',
            [item.inventoryItemId]
          );
          
          if (inventoryResult.rows.length > 0) {
            const productResult = await client.query(
              'SELECT id FROM products WHERE name = $1 LIMIT 1',
              [inventoryResult.rows[0].name]
            );
            
            if (productResult.rows.length > 0) {
              productId = productResult.rows[0].id;
            } else {
              // Create product from inventory item
              const newProductResult = await client.query(
                `INSERT INTO products (name, selling_price, is_active)
                 VALUES ($1, $2, true)
                 RETURNING id`,
                [inventoryResult.rows[0].name, item.unitPrice || 0]
              );
              productId = newProductResult.rows[0].id;
            }
          } else {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Product or inventory item not found for ID: ${item.inventoryItemId}`
            });
          }
        } else {
          productId = productCheck.rows[0].id;
        }
        
        const price = item.unitPrice || item.price || 0;
        const quantity = parseFloat(item.quantity || 0);
        const freeQuantity = parseFloat(item.freeQuantity || 0);
        
        if (quantity <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Quantity must be greater than 0'
          });
        }
        
        if (freeQuantity < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Free quantity cannot be negative'
          });
        }
        
        // Total quantity to deduct from inventory = sold quantity + free items given
        const totalQuantityToDeduct = quantity + freeQuantity;
        
        // Admin sales: deduct from inventory directly (Finished Goods)
        // Salesperson sales: deduct from salesperson allocations
        if (userRole === 'ADMIN') {
          // Find inventory item matching product name in Finished Goods category
          const productNameResult = await client.query(
            'SELECT name FROM products WHERE id = $1',
            [productId]
          );
          const productName = productNameResult.rows[0]?.name;
          
          const inventoryItemResult = await client.query(
            `SELECT ii.id, ii.quantity 
             FROM inventory_items ii
             JOIN inventory_categories ic ON ii.category_id = ic.id
             WHERE ii.name = $1 AND ic.name = 'Finished Goods'
             FOR UPDATE`,
            [productName]
          );
          
          if (inventoryItemResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `No inventory item found for product: ${productName}. Please add it to Finished Goods inventory first.`
            });
          }
          
          const inventoryItem = inventoryItemResult.rows[0];
          const availableStock = parseFloat(inventoryItem.quantity || 0);
          
          if (availableStock < totalQuantityToDeduct) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${productName}. Available: ${availableStock.toFixed(2)}, Required: ${totalQuantityToDeduct.toFixed(2)}`
            });
          }
          
          // Deduct from inventory
          await client.query(
            `UPDATE inventory_items 
             SET quantity = quantity - $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [totalQuantityToDeduct, inventoryItem.id]
          );
          
          // Create sale item
          await client.query(
            `INSERT INTO sale_items (sale_id, product_id, quantity, price, free_quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [saleId, productId, quantity, price, freeQuantity]
          );
        } else {
          // Salesperson: check allocated inventory
          const availableStockResult = await client.query(
            `SELECT COALESCE(SUM(quantity_allocated), 0) as available_stock
             FROM salesperson_allocations
             WHERE salesperson_id = $1 
             AND product_id = $2 
             AND status = 'active'`,
            [userId, productId]
          );
          
          const availableStock = parseFloat(availableStockResult.rows[0].available_stock || 0);
          
          if (availableStock < totalQuantityToDeduct) {
            const productName = productCheck.rows[0]?.name || 'Unknown Product';
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${productName}. Available: ${availableStock.toFixed(2)}, Required: ${totalQuantityToDeduct.toFixed(2)}`
            });
          }
          
          // Create sale item (store both quantity and free_quantity)
          await client.query(
            `INSERT INTO sale_items (sale_id, product_id, quantity, price, free_quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [saleId, productId, quantity, price, freeQuantity]
          );
          
          // Deduct from salesperson allocations (FIFO - oldest first)
          let remainingToDeduct = totalQuantityToDeduct;
          const allocationsResult = await client.query(
            `SELECT id, quantity_allocated
             FROM salesperson_allocations
             WHERE salesperson_id = $1 
             AND product_id = $2 
             AND status = 'active'
             ORDER BY allocation_date ASC, created_at ASC
             FOR UPDATE`,
            [userId, productId]
          );
          
          for (const allocation of allocationsResult.rows) {
            if (remainingToDeduct <= 0) break;
            
            const allocationQty = parseFloat(allocation.quantity_allocated);
            
            if (allocationQty <= remainingToDeduct) {
              // Fully consume this allocation
              await client.query(
                `UPDATE salesperson_allocations 
                 SET status = 'completed', 
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [allocation.id]
              );
              remainingToDeduct -= allocationQty;
            } else {
              // Partially consume this allocation
              await client.query(
                `UPDATE salesperson_allocations 
                 SET quantity_allocated = quantity_allocated - $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [remainingToDeduct, allocation.id]
              );
              remainingToDeduct = 0;
            }
          }
          
          if (remainingToDeduct > 0) {
            await client.query('ROLLBACK');
            return res.status(500).json({
              success: false,
              message: 'Error deducting inventory. Please try again.'
            });
          }
        }
      }
      
      // Get buyer info (including address) before commit
      let buyerName = customerName || null;
      let buyerAddress = null;
      if (buyer_id) {
        const buyerInfoResult = await client.query(
          'SELECT shop_name, address FROM buyers WHERE id = $1',
          [buyer_id]
        );
        if (buyerInfoResult.rows.length > 0) {
          buyerName = buyerInfoResult.rows[0].shop_name || buyerName;
          buyerAddress = buyerInfoResult.rows[0].address;
        }
      }
      
      await client.query('COMMIT');
      
      // Format response to match frontend expectations
      const responseData = {
        ...saleResult.rows[0],
        date: saleResult.rows[0].date,
        route: buyerAddress || null, // Use buyer address instead of route
        address: buyerAddress || null,
        customerName: buyerName,
        totalAmount: parseFloat(saleResult.rows[0].total_amount),
        paymentStatus: saleResult.rows[0].payment_status,
        paymentMethod: paymentMethod || null,
        notes: saleResult.rows[0].notes || null,
        createdAt: saleResult.rows[0].created_at
      };
      
      res.status(201).json({ 
        success: true, 
        data: responseData, 
        message: 'Sale created successfully' 
      });
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

// Update sale
export const updateSale = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { buyerId, date, customerName, paymentStatus, items, notes } = req.body;
    const userId = req.user.userId;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check if sale exists and user has permission
      const saleCheck = await client.query(
        'SELECT salesperson_id FROM sales WHERE id = $1',
        [id]
      );
      
      if (saleCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }
      
      // Find or create buyer if customerName is provided
      let buyer_id = buyerId || null;
      if (customerName && !buyer_id) {
        const buyerResult = await client.query(
          'SELECT id FROM buyers WHERE shop_name = $1 LIMIT 1',
          [customerName]
        );
        if (buyerResult.rows.length > 0) {
          buyer_id = buyerResult.rows[0].id;
        }
      }
      
      // Calculate total if items are provided (free items are additional, not subtracted)
      let totalAmount = saleCheck.rows[0].total_amount;
      if (items && items.length > 0) {
        totalAmount = 0;
        for (const item of items) {
          const price = item.unitPrice || item.price || 0;
          const quantity = item.quantity || 0;
          // Charge for the quantity sold (free items are extra, given as reward)
          totalAmount += price * quantity;
        }
      }
      
      // Update sale and mark as edited
      await client.query(
        `UPDATE sales 
         SET buyer_id = COALESCE($1, buyer_id),
             date = COALESCE($2, date),
             total_amount = $3,
             payment_status = COALESCE($4, payment_status),
             notes = COALESCE($5, notes),
             is_edited = true,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [buyer_id, date, totalAmount, paymentStatus, notes || null, id]
      );
      
      // Update sale items if provided
      if (items && items.length > 0) {
        // Delete existing items
        await client.query('DELETE FROM sale_items WHERE sale_id = $1', [id]);
        
        // Insert new items
        for (const item of items) {
          const inventoryResult = await client.query(
            'SELECT name FROM inventory_items WHERE id = $1',
            [item.inventoryItemId]
          );
          
          let productId = null;
          if (inventoryResult.rows.length > 0) {
            const productResult = await client.query(
              'SELECT id FROM products WHERE name = $1 LIMIT 1',
              [inventoryResult.rows[0].name]
            );
            if (productResult.rows.length > 0) {
              productId = productResult.rows[0].id;
            }
          }
          
          if (productId) {
            const freeQuantity = item.freeQuantity || 0;
            await client.query(
              `INSERT INTO sale_items (sale_id, product_id, quantity, price, free_quantity)
               VALUES ($1, $2, $3, $4, $5)`,
              [id, productId, item.quantity, item.unitPrice || 0, freeQuantity]
            );
          }
        }
      }
      
      // Get buyer info for response
      let buyerName = customerName || null;
      let buyerAddress = null;
      if (buyer_id) {
        const buyerInfoResult = await client.query(
          'SELECT shop_name, address FROM buyers WHERE id = $1',
          [buyer_id]
        );
        if (buyerInfoResult.rows.length > 0) {
          buyerName = buyerInfoResult.rows[0].shop_name || buyerName;
          buyerAddress = buyerInfoResult.rows[0].address;
        }
      }
      
      await client.query('COMMIT');
      
      // Get updated sale
      const updatedSaleResult = await client.query(
        'SELECT * FROM sales WHERE id = $1',
        [id]
      );
      
      res.json({
        success: true,
        data: {
          ...updatedSaleResult.rows[0],
          route: buyerAddress || null,
          address: buyerAddress || null,
          customerName: buyerName
        },
        message: 'Sale updated successfully'
      });
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

// Get today's sales
export const getTodaySales = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT s.*, b.shop_name as buyer_name, b.address as buyer_address
      FROM sales s
      LEFT JOIN buyers b ON s.buyer_id = b.id
      WHERE s.date = CURRENT_DATE
      ORDER BY s.created_at DESC
    `);
    
    const formattedData = result.rows.map(row => ({
      ...row,
      route: row.buyer_address || null,
      address: row.buyer_address || null,
      customerName: row.buyer_name || null
    }));
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    next(error);
  }
};

// Delete sale
export const deleteSale = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    
    // Check if sale exists
    const saleResult = await client.query(
      `SELECT s.* 
       FROM sales s
       WHERE s.id = $1`,
      [id]
    );
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    
    const sale = saleResult.rows[0];
    
    // Check user role for permission
    const userResult = await client.query(
      `SELECT role FROM users WHERE id = $1`,
      [userId]
    );
    const userRole = userResult.rows[0]?.role;
    
    // Check if user has permission (salesperson can only delete their own sales, admin can delete any)
    if (sale.salesperson_id !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to delete this sale' 
      });
    }
    
    await client.query('BEGIN');
    
    // Delete sale items first (due to foreign key constraint)
    await client.query('DELETE FROM sale_items WHERE sale_id = $1', [id]);
    
    // Delete the sale
    const deleteResult = await client.query('DELETE FROM sales WHERE id = $1 RETURNING id', [id]);
    
    if (deleteResult.rows.length === 0) {
      throw new Error('Failed to delete sale');
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Sale deleted successfully' 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting sale:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Reverse sale - restore inventory and mark as reversed
export const reverseSale = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { password, reason } = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role?.toUpperCase();
    
    // Verify password
    if (password !== 'salesperson123') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid password. Please enter the correct password to reverse this bill.' 
      });
    }
    
    // Check if sale exists and is not already reversed
    const saleResult = await client.query(
      `SELECT s.*, u.role as salesperson_role, COALESCE(s.sold_by, 'SALESPERSON') as sold_by
       FROM sales s
       LEFT JOIN users u ON s.salesperson_id = u.id
       WHERE s.id = $1`,
      [id]
    );
    
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    
    const sale = saleResult.rows[0];
    
    // Check if already reversed
    if (sale.is_reversed) {
      return res.status(400).json({ 
        success: false, 
        message: 'This sale has already been reversed' 
      });
    }
    
    // Check permission (salesperson can only reverse their own sales, admin can reverse any)
    if (sale.salesperson_id !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to reverse this sale' 
      });
    }
    
    await client.query('BEGIN');
    
    // Get all sale items with product info
    const saleItemsResult = await client.query(
      `SELECT si.*, p.name as product_name
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1`,
      [id]
    );
    
    // Restore inventory for each item
    for (const item of saleItemsResult.rows) {
      const productId = item.product_id;
      const quantity = parseFloat(item.quantity || 0);
      const freeQuantity = parseFloat(item.free_quantity || 0);
      const totalQuantityToRestore = quantity + freeQuantity;
      
      // Determine if this was an admin sale or salesperson sale
      // Admin sales deduct from inventory_items (Finished Goods)
      // Salesperson sales deduct from salesperson_allocations
      
      if (userRole === 'ADMIN' || sale.sold_by === 'ADMIN') {
        // Restore to Finished Goods inventory
        const productNameResult = await client.query(
          'SELECT name FROM products WHERE id = $1',
          [productId]
        );
        const productName = productNameResult.rows[0]?.name;
        
        if (productName) {
          await client.query(
            `UPDATE inventory_items 
             SET quantity = quantity + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE name = $2 
             AND category_id IN (SELECT id FROM inventory_categories WHERE name = 'Finished Goods')`,
            [totalQuantityToRestore, productName]
          );
        }
      } else {
        // Restore to salesperson allocations
        // We need to restore to the salesperson's allocations
        // Since we don't track which specific allocation was used, we'll restore to the most recent active allocation
        // or create a new allocation entry if needed
        
        // Try to find an active allocation for this product and salesperson
        const allocationResult = await client.query(
          `SELECT id, quantity_allocated
           FROM salesperson_allocations
           WHERE salesperson_id = $1 
           AND product_id = $2 
           AND status = 'active'
           ORDER BY allocation_date DESC, created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [sale.salesperson_id, productId]
        );
        
        if (allocationResult.rows.length > 0) {
          // Restore to existing active allocation
          await client.query(
            `UPDATE salesperson_allocations 
             SET quantity_allocated = quantity_allocated + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [totalQuantityToRestore, allocationResult.rows[0].id]
          );
        } else {
          // Create a new allocation entry for restored items
          // We'll use today's date and a default batch number
          await client.query(
            `INSERT INTO salesperson_allocations 
             (production_id, product_id, salesperson_id, batch_number, quantity_allocated, allocation_date, status, notes)
             VALUES (
               (SELECT id FROM productions WHERE product_id = $1 ORDER BY date DESC LIMIT 1),
               $1,
               $2,
               'RESTORED-' || TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'),
               $3,
               CURRENT_DATE,
               'active',
               'Restored from reversed sale #' || $4
             )`,
            [productId, sale.salesperson_id, totalQuantityToRestore, id]
          );
        }
      }
    }
    
    // Delete all payments associated with this sale
    const paymentsResult = await client.query(
      'SELECT id FROM payments WHERE sale_id = $1',
      [id]
    );
    
    for (const payment of paymentsResult.rows) {
      // Delete cheques first (if any)
      await client.query('DELETE FROM cheques WHERE payment_id = $1', [payment.id]);
      // Delete payment
      await client.query('DELETE FROM payments WHERE id = $1', [payment.id]);
    }
    
    // Delete returns associated with this sale (if any)
    await client.query('DELETE FROM returns WHERE sale_id = $1', [id]);
    
    // Mark sale as reversed
    await client.query(
      `UPDATE sales 
       SET is_reversed = true,
           reversed_at = CURRENT_TIMESTAMP,
           reversed_by = $1,
           reverse_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [userId, reason || 'Wrong order - bill reversed', id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'Sale reversed successfully. Inventory has been restored.' 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reversing sale:', error);
    next(error);
  } finally {
    client.release();
  }
};

