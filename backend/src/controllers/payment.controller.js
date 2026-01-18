// Payment Controller
import pool from '../config/db.js';

async function resolveProductIdFromInput(client, inputId) {
  // In this system, frontend often sends product IDs as "inventoryItemId" from salesperson inventory.
  // We first treat it as a product_id; if not found, try mapping via inventory item name -> product.
  const id = inputId;
  if (!id) return null;

  const productCheck = await client.query('SELECT id FROM products WHERE id = $1', [id]);
  if (productCheck.rows.length > 0) return productCheck.rows[0].id;

  // Fallback: inventory item id -> inventory name -> product id
  const inv = await client.query('SELECT name FROM inventory_items WHERE id = $1', [id]);
  if (inv.rows.length === 0) return null;

  const prodByName = await client.query('SELECT id FROM products WHERE name = $1 LIMIT 1', [inv.rows[0].name]);
  if (prodByName.rows.length > 0) return prodByName.rows[0].id;

  return null;
}

async function deductFromSalespersonAllocationsFIFO(client, salespersonId, productId, quantity) {
  const qty = parseFloat(quantity || 0);
  if (!(qty > 0)) {
    const err = new Error('Quantity must be greater than 0');
    err.statusCode = 400;
    throw err;
  }

  const availableStockResult = await client.query(
    `SELECT COALESCE(SUM(quantity_allocated), 0) as available_stock
     FROM salesperson_allocations
     WHERE salesperson_id = $1
       AND product_id = $2
       AND status = 'active'`,
    [salespersonId, productId]
  );
  const availableStock = parseFloat(availableStockResult.rows[0]?.available_stock || 0);
  if (availableStock < qty) {
    const err = new Error(`Insufficient stock for free items. Available: ${availableStock.toFixed(2)}, Required: ${qty.toFixed(2)}`);
    err.statusCode = 400;
    throw err;
  }

  let remainingToDeduct = qty;
  const allocationsResult = await client.query(
    `SELECT id, quantity_allocated
     FROM salesperson_allocations
     WHERE salesperson_id = $1
       AND product_id = $2
       AND status = 'active'
     ORDER BY allocation_date ASC, created_at ASC
     FOR UPDATE`,
    [salespersonId, productId]
  );

  for (const allocation of allocationsResult.rows) {
    if (remainingToDeduct <= 0) break;
    const allocationQty = parseFloat(allocation.quantity_allocated || 0);

    if (allocationQty <= remainingToDeduct) {
      await client.query(
        `UPDATE salesperson_allocations
         SET status = 'completed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [allocation.id]
      );
      remainingToDeduct -= allocationQty;
    } else {
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
    const err = new Error('Error deducting free items from allocations. Please try again.');
    err.statusCode = 500;
    throw err;
  }
}

// Get all payments
export const getAllPayments = async (req, res, next) => {
  try {
    const { saleId } = req.query;
    let query = `
      SELECT 
        p.*,
        s.total_amount as sale_total,
        s.payment_status as sale_payment_status,
        b.shop_name as buyer_name,
        c.cheque_number,
        c.bank_name as cheque_bank,
        c.return_date as cheque_expiry_date,
        c.status as cheque_status,
        CASE 
          WHEN p.notes IS NOT NULL AND p.notes::text LIKE '%"paymentMethod":"ongoing"%' THEN 'ongoing'
          WHEN p.cheque_amount > 0 AND p.cash_amount > 0 THEN 'split'
          WHEN p.cheque_amount > 0 THEN 'cheque'
          ELSE 'cash'
        END as payment_method,
        p.total_amount as amount
      FROM payments p
      LEFT JOIN sales s ON p.sale_id = s.id
      LEFT JOIN buyers b ON s.buyer_id = b.id
      LEFT JOIN cheques c ON c.payment_id = p.id
      WHERE (s.is_reversed = false OR s.is_reversed IS NULL)
    `;
    const params = [];
    
    if (saleId) {
      params.push(saleId);
      query += ` AND p.sale_id = $${params.length}`;
    }
    
    query += ' ORDER BY p.payment_date DESC, p.created_at DESC';
    
    const result = await pool.query(query, params);
    
    // Get payment summary for each sale to calculate remaining balance
    // Only count cash amounts and cleared cheque amounts as paid
    const saleIds = [...new Set(result.rows.map(row => row.sale_id))];
    const paymentSummaries = {};
    
    if (saleIds.length > 0) {
      const summaryQuery = `
        SELECT 
          p.sale_id,
          COALESCE(SUM(p.cash_amount), 0) + 
          COALESCE(SUM(CASE WHEN c.status = 'cleared' THEN p.cheque_amount ELSE 0 END), 0) as total_paid
        FROM payments p
        LEFT JOIN cheques c ON c.payment_id = p.id
        WHERE p.sale_id = ANY($1) AND p.status = 'completed'
        GROUP BY p.sale_id
      `;
      const summaryResult = await pool.query(summaryQuery, [saleIds]);
      
      summaryResult.rows.forEach(row => {
        paymentSummaries[row.sale_id] = parseFloat(row.total_paid);
      });
    }
    
    // Format response to match frontend expectations
    const formattedPayments = result.rows.map(row => {
      const saleTotal = parseFloat(row.sale_total || 0);
      const totalPaid = paymentSummaries[row.sale_id] || 0;
      const remainingBalance = Math.max(0, saleTotal - totalPaid);
      
      // Calculate payment status based on remaining balance (considering cleared cheques)
      let calculatedPaymentStatus = 'pending';
      if (remainingBalance <= 0.01) { // Allow for small rounding differences
        calculatedPaymentStatus = 'paid';
      } else if (totalPaid > 0) {
        calculatedPaymentStatus = 'partial';
      }
      
      return {
        id: row.id,
        saleId: row.sale_id,
        amount: parseFloat(row.amount || row.total_amount || 0),
        cashAmount: parseFloat(row.cash_amount || 0),
        chequeAmount: parseFloat(row.cheque_amount || 0),
        paymentMethod: row.payment_method || 'cash',
        chequeNumber: row.cheque_number || null,
        chequeBank: row.cheque_bank || null,
        returnDate: row.cheque_expiry_date || null,
        expiryDate: row.cheque_expiry_date || null,
        chequeStatus: row.cheque_status || null,
        shopName: row.buyer_name || null,
        notes: row.notes || null,
        createdAt: row.created_at,
        createdBy: row.created_by,
        paymentStatus: row.status || 'completed',
        sale: row.sale_total ? {
          id: row.sale_id,
          totalAmount: saleTotal,
          customerName: row.buyer_name,
          paymentStatus: calculatedPaymentStatus,
          totalPaid: totalPaid,
          remainingBalance: remainingBalance
        } : null
      };
    });
    
    // Group ongoing payments by sale_id if sale is not fully paid
    const ongoingPaymentsBySale = {};
    const nonOngoingPayments = [];
    const groupedPaymentIds = new Set();
    
    formattedPayments.forEach(payment => {
      const isOngoing = payment.paymentMethod === 'ongoing';
      const isFullyPaid = payment.sale?.remainingBalance <= 0.01 || false;
      
      if (isOngoing && !isFullyPaid) {
        // Group ongoing payments that are not fully paid
        const saleId = payment.saleId;
        if (!ongoingPaymentsBySale[saleId]) {
          ongoingPaymentsBySale[saleId] = {
            payments: [],
            sale: payment.sale,
            shopName: payment.shopName,
            saleId: saleId
          };
        }
        ongoingPaymentsBySale[saleId].payments.push(payment);
        groupedPaymentIds.add(payment.id);
      } else {
        // Keep non-ongoing payments and fully paid ongoing payments as individual rows
        nonOngoingPayments.push(payment);
      }
    });
    
    // Create aggregated rows for ongoing payments
    const aggregatedOngoingPayments = Object.values(ongoingPaymentsBySale).map(group => {
      const payments = group.payments;
      const aggregatedAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const aggregatedCashAmount = payments.reduce((sum, p) => sum + (p.cashAmount || 0), 0);
      const aggregatedChequeAmount = payments.reduce((sum, p) => sum + (p.chequeAmount || 0), 0);
      
      // Use the first payment's date (most recent due to DESC ordering)
      const firstPayment = payments[0];
      // Use the latest payment date
      const latestPayment = payments.reduce((latest, p) => {
        return new Date(p.createdAt) > new Date(latest.createdAt) ? p : latest;
      }, payments[0]);
      
      return {
        id: `ongoing-${group.saleId}`, // Composite ID to indicate it's grouped
        saleId: group.saleId,
        amount: aggregatedAmount,
        cashAmount: aggregatedCashAmount,
        chequeAmount: aggregatedChequeAmount,
        paymentMethod: 'ongoing',
        chequeNumber: null,
        chequeBank: null,
        returnDate: null,
        expiryDate: null,
        chequeStatus: null,
        shopName: group.shopName,
        notes: `Multiple ongoing payments (${payments.length} payment${payments.length > 1 ? 's' : ''})`,
        createdAt: latestPayment.createdAt, // Show latest payment date
        createdBy: latestPayment.createdBy,
        paymentStatus: 'completed',
        sale: group.sale,
        paymentCount: payments.length, // Include count for reference
        paymentIds: payments.map(p => p.id) // Include original payment IDs
      };
    });
    
    // Combine aggregated ongoing payments with non-ongoing payments
    // Sort by date (most recent first)
    const formattedData = [...aggregatedOngoingPayments, ...nonOngoingPayments].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    next(error);
  }
};

// Get single payment
export const getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT p.*, s.total_amount as sale_total, b.shop_name as buyer_name
      FROM payments p
      LEFT JOIN sales s ON p.sale_id = s.id
      LEFT JOIN buyers b ON s.buyer_id = b.id
      WHERE p.id = $1 AND (s.is_reversed = false OR s.is_reversed IS NULL)
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    
    // Get cheques for this payment
    const chequesResult = await pool.query('SELECT * FROM cheques WHERE payment_id = $1', [id]);
    
    res.json({ 
      success: true, 
      data: { ...result.rows[0], cheques: chequesResult.rows } 
    });
  } catch (error) {
    next(error);
  }
};

// Create payment
export const createPayment = async (req, res, next) => {
  try {
    const { saleId, amount, paymentMethod, cashAmount, chequeAmount, chequeNumber, chequeBank, expiryDate, chequeStatus, notes, freeItems } =
      req.body;
    const userId = req.user.userId;
    
    if (!saleId) {
      return res.status(400).json({ success: false, message: 'Sale ID is required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get sale total first
      const saleResult = await client.query('SELECT total_amount, salesperson_id FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
      if (saleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Sale not found' });
      }
      
      const saleTotal = parseFloat(saleResult.rows[0].total_amount);
      const saleSalespersonId = saleResult.rows[0].salesperson_id;
      
      // Get current total paid for this sale
      // Only count cash amounts and cleared cheque amounts as paid
      const paidResult = await client.query(
        `SELECT 
          COALESCE(SUM(p.cash_amount), 0) + 
          COALESCE(SUM(CASE WHEN c.status = 'cleared' THEN p.cheque_amount ELSE 0 END), 0) as total_paid
         FROM payments p
         LEFT JOIN cheques c ON c.payment_id = p.id
         WHERE p.sale_id = $1 AND p.status = 'completed'`,
        [saleId]
      );
      const currentPaid = parseFloat(paidResult.rows[0].total_paid);
      const remaining = saleTotal - currentPaid;
      
      // Determine cash and cheque amounts based on payment method
      let cashAmt = 0;
      let chequeAmt = 0;
      
      if (paymentMethod === 'cash') {
        // Full cash payment
        const paymentAmt = parseFloat(amount) || parseFloat(cashAmount) || 0;
        cashAmt = Math.min(paymentAmt, remaining); // Don't allow overpayment
      } else if (paymentMethod === 'cheque') {
        // Full cheque payment - use chequeAmount if provided, otherwise use amount
        // Prioritize chequeAmount over amount when both are provided
        const paymentAmt = (chequeAmount !== undefined && chequeAmount !== null) 
          ? parseFloat(chequeAmount) 
          : (parseFloat(amount) || 0);
        chequeAmt = paymentAmt > 0 ? Math.min(paymentAmt, remaining) : 0;
        
        // Validate cheque number before creating payment
        if (chequeAmt > 0 && (!chequeNumber || chequeNumber.trim() === '')) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Cheque number is required when paying by cheque' });
        }
      } else if (paymentMethod === 'split') {
        // Split payment: half cash, half cheque (or custom amounts)
        const cashInput = parseFloat(cashAmount) || 0;
        const chequeInput = parseFloat(chequeAmount) || 0;
        
        // If no specific amounts, split the total amount 50/50
        if (!cashInput && !chequeInput && amount) {
          const totalAmt = Math.min(parseFloat(amount), remaining);
          cashAmt = totalAmt / 2;
          chequeAmt = totalAmt / 2;
        } else {
          cashAmt = Math.min(cashInput, remaining);
          const remainingAfterCash = remaining - cashAmt;
          chequeAmt = Math.min(chequeInput, remainingAfterCash);
        }
        
        // Validate cheque number if cheque amount > 0
        if (chequeAmt > 0 && (!chequeNumber || chequeNumber.trim() === '')) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Cheque number is required when paying by cheque' });
        }
      } else if (paymentMethod === 'ongoing') {
        // Ongoing payments: cash only, amount can be 0 or greater (for partial settlement)
        const paymentAmt = parseFloat(amount) || parseFloat(cashAmount) || 0;
        cashAmt = Math.max(0, Math.min(paymentAmt, remaining)); // Allow 0 for ongoing
      } else {
        // Default: assume cash
        const paymentAmt = parseFloat(amount) || 0;
        cashAmt = Math.min(paymentAmt, remaining);
      }
      
      const totalPayment = cashAmt + chequeAmt;
      
      // For ongoing payments, allow 0 amount (just marking as ongoing)
      if (paymentMethod !== 'ongoing' && (totalPayment <= 0 || isNaN(totalPayment))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: 'Payment amount must be greater than 0' 
        });
      }
      
      if (totalPayment > remaining) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          message: `Payment amount exceeds remaining balance. Remaining: Rs. ${remaining.toFixed(2)}` 
        });
      }
      
      // Store payment method in notes for ongoing payments
      let paymentNotes = notes || null;
      if (paymentMethod === 'ongoing') {
        const notesObj = { paymentMethod: 'ongoing' };
        if (notes) {
          try {
            const existingNotes = typeof notes === 'string' ? JSON.parse(notes) : notes;
            paymentNotes = JSON.stringify({ ...existingNotes, ...notesObj });
          } catch {
            paymentNotes = JSON.stringify(notesObj);
          }
        } else {
          paymentNotes = JSON.stringify(notesObj);
        }
      }
      
      // Create payment
      const paymentResult = await client.query(
        `INSERT INTO payments (sale_id, cash_amount, cheque_amount, payment_date, notes, status)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, 'completed')
         RETURNING *`,
        [saleId, cashAmt, chequeAmt, paymentNotes]
      );
      
      const paymentId = paymentResult.rows[0].id;
      
      // Create cheque record if cheque amount > 0
      if (chequeAmt > 0) {
        if (!chequeNumber || chequeNumber.trim() === '') {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Cheque number is required when paying by cheque' });
        }
        
        await client.query(
          `INSERT INTO cheques (payment_id, cheque_number, bank_name, cheque_date, return_date, amount, status, notes)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7)`,
          [
            paymentId, 
            chequeNumber, 
            chequeBank || null, 
            expiryDate || null, 
            chequeAmt, 
            chequeStatus || 'pending', 
            notes || null
          ]
        );
      }

      // Deduct free items (e.g., free yogurt given) from salesperson allocations and store for audit
      if (Array.isArray(freeItems) && freeItems.length > 0) {
        // Normalize: resolve product IDs and combine duplicates to avoid double-deduction
        const aggregated = new Map(); // productId -> totalQty

        for (const fi of freeItems) {
          const inputId = fi?.productId || fi?.inventoryItemId;
          const productId = await resolveProductIdFromInput(client, inputId);
          const qty = parseFloat(fi?.quantity || 0);

          if (!productId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: `Invalid free item product: ${String(inputId || '')}` });
          }
          if (!(qty > 0)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Free item quantity must be greater than 0' });
          }
          aggregated.set(productId, (aggregated.get(productId) || 0) + qty);
        }

        for (const [productId, qty] of aggregated.entries()) {
          // Store audit row (unique per payment + product)
          await client.query(
            `INSERT INTO payment_free_items (payment_id, product_id, quantity, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (payment_id, product_id) DO UPDATE
             SET quantity = EXCLUDED.quantity`,
            [paymentId, productId, qty, userId]
          );

          // Deduct from the sale's salesperson allocations (not necessarily current user)
          await deductFromSalespersonAllocationsFIFO(client, saleSalespersonId, productId, qty);
        }
      }
      
      // Update sale payment status
      // Calculate total paid: cash + cleared cheques (pending cheques not counted as paid)
      const updatedPaidResult = await client.query(
        `SELECT 
          COALESCE(SUM(p.cash_amount), 0) + COALESCE(
            (SELECT SUM(p2.cheque_amount) 
             FROM payments p2 
             JOIN cheques c ON p2.id = c.payment_id 
             WHERE p2.sale_id = $1 AND c.status = 'cleared' AND p2.status = 'completed'), 
            0
          ) as total_paid_cleared
         FROM payments p
         WHERE p.sale_id = $1 AND p.status = 'completed'`,
        [saleId]
      );
      const totalPaidCleared = parseFloat(updatedPaidResult.rows[0].total_paid_cleared || 0);
      
      let paymentStatus = 'pending';
      if (totalPaidCleared >= saleTotal) {
        paymentStatus = 'paid';
      } else if (totalPaidCleared > 0) {
        paymentStatus = 'partial';
      }
      
      await client.query(
        'UPDATE sales SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [paymentStatus, saleId]
      );
      
      await client.query('COMMIT');
      
      // Format response to match frontend expectations
      const responseData = {
        ...paymentResult.rows[0],
        saleId: paymentResult.rows[0].sale_id,
        paymentMethod: paymentMethod || 'cash',
        amount: totalPayment,
        cashAmount: cashAmt,
        chequeAmount: chequeAmt,
        chequeNumber: chequeNumber || null,
        chequeBank: chequeBank || null,
        returnDate: expiryDate || null,
        expiryDate: expiryDate || null,
        chequeStatus: chequeStatus || 'pending',
        remainingBalance: saleTotal - totalPaidCleared
      };
      
      res.status(201).json({ 
        success: true, 
        data: responseData, 
        message: 'Payment created successfully' 
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

// Get pending payments
export const getPendingPayments = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.*, s.total_amount as sale_total, s.payment_status, b.shop_name as buyer_name
      FROM payments p
      LEFT JOIN sales s ON p.sale_id = s.id
      LEFT JOIN buyers b ON s.buyer_id = b.id
      WHERE p.status = 'pending' AND (s.is_reversed = false OR s.is_reversed IS NULL)
      ORDER BY p.payment_date DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get cheque expiry alerts (cheques expiring within 2 days)
export const getChequeExpiryAlerts = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.cheque_number,
        c.bank_name,
        c.cheque_date,
        c.return_date,
        c.amount,
        c.status,
        c.notes,
        c.created_at,
        c.updated_at,
        p.id as payment_id,
        p.sale_id,
        s.total_amount as sale_total,
        b.shop_name as buyer_name,
        (c.return_date - CURRENT_DATE)::INTEGER as days_until_expiry
      FROM cheques c
      JOIN payments p ON c.payment_id = p.id
      JOIN sales s ON p.sale_id = s.id
      LEFT JOIN buyers b ON s.buyer_id = b.id
      WHERE c.status IN ('pending', 'cleared')
        AND c.return_date IS NOT NULL
        AND c.return_date >= CURRENT_DATE
        AND c.return_date <= CURRENT_DATE + INTERVAL '2 days'
        AND s.is_reversed = false
      ORDER BY c.return_date ASC
    `);
    
    const formattedData = result.rows.map(row => ({
      id: row.id,
      paymentId: row.payment_id,
      saleId: row.sale_id,
      chequeNumber: row.cheque_number,
      bankName: row.bank_name,
      amount: parseFloat(row.amount || 0),
      expiryDate: row.return_date ? row.return_date.toISOString().split('T')[0] : null,
      daysUntilExpiry: parseInt(row.days_until_expiry) || 0,
      status: row.status,
      buyerName: row.buyer_name,
      saleTotal: parseFloat(row.sale_total || 0),
      notes: row.notes || null
    }));
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching cheque alerts:', error);
    next(error);
  }
};

// Get shop-wise payment history (for admin dashboard)
export const getShopWisePaymentHistory = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.id as shop_id,
        b.shop_name,
        b.contact,
        b.address,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'saleId', s.id,
              'saleDate', s.date,
              'totalAmount', s.total_amount,
              'paymentStatus', s.payment_status,
              'paidCash', COALESCE(ps.total_cash, 0),
              'paidChequeCleared', COALESCE(ps.total_cheque_cleared, 0),
              'pendingCash', GREATEST(0, s.total_amount - COALESCE(ps.total_cash, 0) - COALESCE(ps.total_cheque_cleared, 0) - COALESCE(ps.total_cheque_pending, 0)),
              'pendingCheque', COALESCE(ps.total_cheque_pending, 0),
              'remainingAmount', GREATEST(0, s.total_amount - COALESCE(ps.total_cash, 0) - COALESCE(ps.total_cheque_cleared, 0) - COALESCE(ps.total_cheque_pending, 0)),
              'payments', ps.payments_list
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'::json
        ) as sales,
        COALESCE(SUM(GREATEST(0, s.total_amount - COALESCE(ps.total_cash, 0) - COALESCE(ps.total_cheque_cleared, 0) - COALESCE(ps.total_cheque_pending, 0))), 0) as total_pending_cash,
        COALESCE(SUM(ps.total_cheque_pending), 0) as total_pending_cheque
      FROM buyers b
      LEFT JOIN sales s ON b.id = s.buyer_id AND s.is_reversed = false
      LEFT JOIN (
        SELECT
          p.sale_id,
          SUM(CASE WHEN p.status = 'completed' THEN p.cash_amount ELSE 0 END) as total_cash,
          COALESCE(SUM(CASE WHEN c.status = 'pending' AND p.status = 'completed' THEN p.cheque_amount ELSE 0 END), 0) as total_cheque_pending,
          COALESCE(SUM(CASE WHEN c.status = 'cleared' AND p.status = 'completed' THEN p.cheque_amount ELSE 0 END), 0) as total_cheque_cleared,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'paymentId', p.id,
                'paymentDate', p.payment_date,
                'cashAmount', p.cash_amount,
                'chequeAmount', p.cheque_amount,
                'totalAmount', p.total_amount,
                'chequeNumber', c.cheque_number,
                'chequeBank', c.bank_name,
                'chequeStatus', c.status,
                'chequeExpiryDate', c.return_date,
                'notes', p.notes,
                'createdAt', p.created_at
              )
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::json
          ) as payments_list
        FROM payments p
        LEFT JOIN cheques c ON p.id = c.payment_id
        WHERE p.status = 'completed'
        GROUP BY p.sale_id
      ) ps ON s.id = ps.sale_id
      WHERE b.is_active = true
      GROUP BY b.id, b.shop_name, b.contact, b.address
      HAVING COUNT(s.id) > 0
      ORDER BY b.shop_name
    `);

    const formattedData = result.rows.map(row => {
      const sales = Array.isArray(row.sales) ? row.sales : [];
      let paymentStatus = 'paid';
      let hasPendingCash = parseFloat(row.total_pending_cash || 0) > 0;
      let hasPendingCheque = parseFloat(row.total_pending_cheque || 0) > 0;

      if (hasPendingCash && hasPendingCheque) {
        paymentStatus = 'cash + cheque';
      } else if (hasPendingCash) {
        paymentStatus = 'cash';
      } else if (hasPendingCheque) {
        paymentStatus = 'cheque';
      }

      return {
        shopId: row.shop_id,
        shopName: row.shop_name,
        contact: row.contact,
        address: row.address,
        paymentStatus,
        totalPendingCash: parseFloat(row.total_pending_cash || 0),
        totalPendingCheque: parseFloat(row.total_pending_cheque || 0),
        sales: sales
      };
    });

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error getting shop-wise payment history:', error);
    next(error);
  }
};

// Get ALL cheques with full details (for Admin Cheques panel)
// Includes cheques from both admin-created payments and salesperson mobile sales
export const getAllCheques = async (req, res, next) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT 
        c.id,
        c.payment_id,
        c.cheque_number,
        c.bank_name,
        c.cheque_date,
        c.return_date,
        c.amount,
        c.status,
        c.notes,
        c.created_at,
        p.sale_id,
        p.cash_amount,
        p.cheque_amount,
        s.total_amount as sale_total,
        s.date as sale_date,
        s.salesperson_id,
        b.shop_name,
        b.contact as shop_contact,
        b.address as shop_address,
        u.name as salesperson_name,
        u.username as salesperson_username
      FROM cheques c
      JOIN payments p ON c.payment_id = p.id
      JOIN sales s ON p.sale_id = s.id
      LEFT JOIN buyers b ON s.buyer_id = b.id
      LEFT JOIN users u ON s.salesperson_id = u.id
      WHERE s.is_reversed = false
    `;
    const params = [];
    
    if (status && status !== 'all') {
      params.push(status);
      query += ` AND c.status = $${params.length}`;
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    // Format response for frontend
    const formattedData = result.rows.map(row => ({
      id: row.id,
      paymentId: row.payment_id,
      saleId: row.sale_id,
      chequeNumber: row.cheque_number,
      chequeBank: row.bank_name,
      chequeDate: row.cheque_date,
      returnDate: row.return_date,
      expiryDate: row.return_date,
      amount: parseFloat(row.amount || 0),
      status: row.status,
      chequeStatus: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      // Sale & Shop info
      shopName: row.shop_name,
      saleTotal: parseFloat(row.sale_total || 0),
      saleDate: row.sale_date,
      // Salesperson info (who made the sale - admin or salesperson)
      salespersonName: row.salesperson_name,
      salespersonUsername: row.salesperson_username,
      // Payment breakdown
      cashAmount: parseFloat(row.cash_amount || 0),
      chequeAmount: parseFloat(row.cheque_amount || 0)
    }));
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error getting all cheques:', error);
    next(error);
  }
};

// Get ongoing pending payments for salesperson
export const getOngoingPendingPayments = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Get sales with payment_status = 'pending' or 'partial' that belong to this salesperson
    // AND have at least one payment record marked as 'ongoing' in notes
    // AND have remaining balance > 0 (not fully paid)
    const result = await pool.query(`
      SELECT 
        s.id as sale_id,
        s.date as sale_date,
        s.total_amount,
        s.payment_status,
        b.id as buyer_id,
        b.shop_name,
        b.contact,
        b.address,
        COALESCE(
          (SELECT SUM(p.cash_amount) + COALESCE(
            (SELECT SUM(p2.cheque_amount) 
             FROM payments p2 
             JOIN cheques c2 ON p2.id = c2.payment_id 
             WHERE p2.sale_id = s.id AND c2.status = 'cleared' AND p2.status = 'completed'), 
            0
          )
           FROM payments p 
           WHERE p.sale_id = s.id AND p.status = 'completed'), 
          0
        ) as total_paid
      FROM sales s
      LEFT JOIN buyers b ON s.buyer_id = b.id
      WHERE s.salesperson_id = $1 
        AND s.payment_status IN ('pending', 'partial')
        AND EXISTS (
          SELECT 1 
          FROM payments p 
          WHERE p.sale_id = s.id 
            AND p.status = 'completed'
            AND p.notes IS NOT NULL 
            AND p.notes::text LIKE '%"paymentMethod":"ongoing"%'
        )
      ORDER BY s.date DESC
    `, [userId]);
    
    const formattedData = result.rows
      .map(row => {
        const totalAmount = parseFloat(row.total_amount || 0);
        const totalPaid = parseFloat(row.total_paid || 0);
        const remainingBalance = Math.max(0, totalAmount - totalPaid);
        
        return {
          saleId: row.sale_id,
          saleDate: row.sale_date,
          totalAmount,
          totalPaid,
          remainingBalance,
          paymentStatus: row.payment_status,
          buyerId: row.buyer_id,
          shopName: row.shop_name,
          contact: row.contact,
          address: row.address
        };
      })
      .filter(item => item.remainingBalance > 0.01); // Filter out fully paid sales (allow for small rounding differences)
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error getting ongoing pending payments:', error);
    next(error);
  }
};

// Update cheque status (Admin: mark as collected/cleared, pending, or bounced)
export const updateChequeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'cleared', 'bounced', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const result = await pool.query(
      `UPDATE cheques 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cheque not found'
      });
    }
    
    res.json({
      success: true,
      message: `Cheque marked as ${status}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating cheque status:', error);
    next(error);
  }
};

