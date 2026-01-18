// Buyer Controller
import pool from '../config/db.js';

// Helper function to check if columns exist in buyers table
async function checkColumnsExist(columnNames) {
  try {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'buyers' 
      AND column_name = ANY($1)
    `, [columnNames]);
    const existingColumns = result.rows.map(row => row.column_name);
    return columnNames.every(col => existingColumns.includes(col));
  } catch (error) {
    console.error('Error checking columns:', error);
    return false;
  }
}

// Get all buyers
export const getAllBuyers = async (req, res, next) => {
  try {
    // Admin sees all shops, salesperson sees all shops too
    const result = await pool.query('SELECT * FROM buyers ORDER BY shop_name');
    
    // Format response to match frontend expectations (camelCase)
    const formattedData = result.rows.map(row => ({
      id: row.id,
      shopName: row.shop_name,
      contact: row.contact,
      address: row.address,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    next(error);
  }
};

// Get single buyer
export const getBuyerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM buyers WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Buyer not found' });
    }
    
    const row = result.rows[0];
    // Format response to match frontend expectations (camelCase)
    const formattedData = {
      id: row.id,
      shopName: row.shop_name,
      contact: row.contact,
      address: row.address,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    next(error);
  }
};

// Geocoding helper function using OpenStreetMap Nominatim API
async function geocodeAddress(address) {
  if (!address || address.trim().length === 0) {
    return { latitude: null, longitude: null };
  }
  
  try {
    const encodedAddress = encodeURIComponent(address.trim());
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`, {
      headers: {
        'User-Agent': 'YogurtERP/1.0' // Required by Nominatim
      }
    });
    
    if (!response.ok) {
      console.error('Geocoding API error:', response.statusText);
      return { latitude: null, longitude: null };
    }
    
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }
    return { latitude: null, longitude: null };
  } catch (error) {
    console.error('Error geocoding address:', error);
    return { latitude: null, longitude: null };
  }
}

// Create buyer
export const createBuyer = async (req, res, next) => {
  try {
    // Accept both camelCase (shopName) and snake_case (shop_name)
    const shopName = req.body.shop_name || req.body.shopName;
    const contact = req.body.contact || null;
    const address = req.body.address || null;
    const latitude = req.body.latitude !== undefined ? parseFloat(req.body.latitude) : null;
    const longitude = req.body.longitude !== undefined ? parseFloat(req.body.longitude) : null;
    const is_active = req.body.is_active !== undefined ? req.body.is_active : (req.body.isActive !== undefined ? req.body.isActive : true);
    
    // Validate shop name - check for empty string or whitespace only
    if (!shopName || typeof shopName !== 'string' || shopName.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Shop name is required' });
    }
    
    // If address is provided but coordinates are not, try to geocode
    let finalLatitude = latitude;
    let finalLongitude = longitude;
    if (address && !latitude && !longitude) {
      const geocodeResult = await geocodeAddress(address);
      finalLatitude = geocodeResult.latitude;
      finalLongitude = geocodeResult.longitude;
    }
    
    // Check if latitude/longitude columns exist
    const hasCoordinates = await checkColumnsExist(['latitude', 'longitude']);
    
    let result;
    if (hasCoordinates) {
      // Insert with coordinates
      result = await pool.query(
        `INSERT INTO buyers (shop_name, contact, address, latitude, longitude, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [shopName.trim(), contact || null, address || null, finalLatitude, finalLongitude, is_active !== false]
      );
    } else {
      // Insert without coordinates (columns don't exist yet)
      console.warn('Latitude/longitude columns not found in buyers table. Please run migration: add_shop_coordinates.sql');
      result = await pool.query(
        `INSERT INTO buyers (shop_name, contact, address, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [shopName.trim(), contact || null, address || null, is_active !== false]
      );
    }
    
    const row = result.rows[0];
    // Format response to match frontend expectations (camelCase)
    const formattedData = {
      id: row.id,
      shopName: row.shop_name,
      contact: row.contact,
      address: row.address,
      latitude: (row.latitude !== undefined && row.latitude !== null) ? parseFloat(row.latitude) : null,
      longitude: (row.longitude !== undefined && row.longitude !== null) ? parseFloat(row.longitude) : null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    
    res.status(201).json({ success: true, data: formattedData, message: 'Buyer created successfully' });
  } catch (error) {
    console.error('Error creating buyer:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      detail: error.detail,
      hint: error.hint
    });
    next(error);
  }
};

// Update buyer
export const updateBuyer = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Accept both camelCase and snake_case
    const shopName = req.body.shop_name || req.body.shopName;
    const contact = req.body.contact || null;
    const address = req.body.address || null;
    const latitude = req.body.latitude !== undefined ? parseFloat(req.body.latitude) : undefined;
    const longitude = req.body.longitude !== undefined ? parseFloat(req.body.longitude) : undefined;
    const is_active = req.body.is_active !== undefined ? req.body.is_active : (req.body.isActive !== undefined ? req.body.isActive : undefined);
    
    // Get current buyer data
    const currentResult = await pool.query('SELECT * FROM buyers WHERE id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Buyer not found' });
    }
    const currentBuyer = currentResult.rows[0];
    
    // Determine final values (use provided values or keep current)
    const finalShopName = shopName !== undefined ? shopName.trim() : currentBuyer.shop_name;
    const finalContact = contact !== null ? contact : currentBuyer.contact;
    const finalAddress = address !== null ? address : currentBuyer.address;
    const finalIsActive = is_active !== undefined ? is_active : currentBuyer.is_active;
    
    // Handle coordinates - if address changed and no coordinates provided, try geocoding
    let finalLatitude = latitude !== undefined ? latitude : currentBuyer.latitude;
    let finalLongitude = longitude !== undefined ? longitude : currentBuyer.longitude;
    
    // If address changed and coordinates are not explicitly provided, try geocoding
    if (finalAddress !== currentBuyer.address && latitude === undefined && longitude === undefined) {
      const geocodeResult = await geocodeAddress(finalAddress);
      if (geocodeResult.latitude && geocodeResult.longitude) {
        finalLatitude = geocodeResult.latitude;
        finalLongitude = geocodeResult.longitude;
      }
    }
    
    // Check if latitude/longitude columns exist
    const hasCoordinates = await checkColumnsExist(['latitude', 'longitude']);
    
    let result;
    if (hasCoordinates) {
      // Update with coordinates
      result = await pool.query(
        `UPDATE buyers 
         SET shop_name = $1,
             contact = $2,
             address = $3,
             latitude = $4,
             longitude = $5,
             is_active = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING *`,
        [finalShopName, finalContact, finalAddress, finalLatitude, finalLongitude, finalIsActive, id]
      );
    } else {
      // Update without coordinates (columns don't exist yet)
      result = await pool.query(
        `UPDATE buyers 
         SET shop_name = $1,
             contact = $2,
             address = $3,
             is_active = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [finalShopName, finalContact, finalAddress, finalIsActive, id]
      );
    }
    
    // Format response to match frontend expectations (camelCase)
    const row = result.rows[0];
    const formattedData = {
      id: row.id,
      shopName: row.shop_name,
      contact: row.contact,
      address: row.address,
      latitude: (row.latitude !== undefined && row.latitude !== null) ? parseFloat(row.latitude) : null,
      longitude: (row.longitude !== undefined && row.longitude !== null) ? parseFloat(row.longitude) : null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    
    res.json({ success: true, data: formattedData, message: 'Buyer updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete buyer
export const deleteBuyer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force } = req.query; // Allow force delete
    
    // Check if buyer has any sales
    const salesCheck = await pool.query('SELECT COUNT(*) as count FROM sales WHERE buyer_id = $1', [id]);
    const salesCount = parseInt(salesCheck.rows[0].count);
    
    if (salesCount > 0 && force !== 'true') {
      // If not force delete, ask for confirmation
      return res.status(400).json({ 
        success: false, 
        message: `This shop has ${salesCount} sale(s). Delete anyway?`,
        hasAssociatedSales: true,
        salesCount: salesCount
      });
    }
    
    // If force delete or no sales, proceed with deletion
    // First, set buyer_id to NULL for associated sales (preserve sales data)
    if (salesCount > 0) {
      await pool.query('UPDATE sales SET buyer_id = NULL WHERE buyer_id = $1', [id]);
    }
    
    const result = await pool.query('DELETE FROM buyers WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Buyer not found' });
    }
    
    res.json({ success: true, message: 'Shop deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Get buyers with payment status (for salesperson)
export const getBuyersWithPaymentStatus = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Get ALL active buyers (not filtered by salesperson - show all shops)
    const buyersResult = await pool.query(`
      SELECT b.*
      FROM buyers b
      WHERE b.is_active = true
      ORDER BY b.shop_name
    `);
    
    const formattedData = [];
    
      for (const buyer of buyersResult.rows) {
      // Get all sales for this buyer from this salesperson with proper payment breakdown
      // Only calculate payment status for sales from this salesperson (exclude reversed)
      const salesResult = await pool.query(`
        SELECT 
          s.id,
          s.date,
          s.total_amount,
          s.payment_status,
          -- Paid cash: sum of cash_amount from completed payments
          COALESCE(
            (SELECT SUM(p.cash_amount) 
             FROM payments p 
             WHERE p.sale_id = s.id AND p.status = 'completed'), 
            0
          ) as paid_cash,
          -- Paid cheque (cleared): sum of cheque amounts where cheque status is cleared
          COALESCE(
            (SELECT SUM(p.cheque_amount) 
             FROM payments p 
             JOIN cheques c ON p.id = c.payment_id 
             WHERE p.sale_id = s.id AND c.status = 'cleared' AND p.status = 'completed'), 
            0
          ) as paid_cheque_cleared,
          -- Pending cheque: sum of cheque amounts where cheque status is pending
          COALESCE(
            (SELECT SUM(p.cheque_amount) 
             FROM payments p 
             JOIN cheques c ON p.id = c.payment_id 
             WHERE p.sale_id = s.id AND c.status = 'pending' AND p.status = 'completed'), 
            0
          ) as pending_cheque_amount,
          -- Total paid (cash + cleared cheques)
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
          ) as total_paid_cleared
        FROM sales s
        WHERE s.buyer_id = $1 AND s.salesperson_id = $2 AND s.is_reversed = false
        ORDER BY s.date DESC
      `, [buyer.id, userId]);
      
      const sales = salesResult.rows.map(sale => {
        const totalAmount = parseFloat(sale.total_amount || 0);
        const paidCash = parseFloat(sale.paid_cash || 0);
        const paidChequeCleared = parseFloat(sale.paid_cheque_cleared || 0);
        const pendingChequeAmount = parseFloat(sale.pending_cheque_amount || 0);
        const totalPaidCleared = parseFloat(sale.total_paid_cleared || 0);
        
        // Check if there are any payment records for this sale
        const hasPaymentRecords = totalPaidCleared > 0 || pendingChequeAmount > 0;
        
        // Remaining amount = total - (paid cash + cleared cheques)
        // Note: pending cheques are not counted as "paid" yet
        const remainingAmount = Math.max(0, totalAmount - totalPaidCleared - pendingChequeAmount);
        
        // Pending cash logic:
        // - If there are payment records, pendingCash = 0 (cash payments are immediately marked as paid)
        // - If there are NO payment records (ongoing sale), pendingCash = remaining amount
        // Only ongoing payments (no payment records) should show cash pending, not cash payments
        const pendingCash = hasPaymentRecords ? 0 : Math.max(0, remainingAmount);
        
        return {
          saleId: sale.id,
          saleDate: sale.date,
          totalAmount,
          paymentStatus: sale.payment_status,
          paidCash,
          paidCheque: paidChequeCleared,
          pendingCash,
          pendingCheque: pendingChequeAmount,
          remainingAmount: remainingAmount + pendingChequeAmount // Total remaining including pending cheques
        };
      });
      
      // Calculate overall payment status for this buyer
      // Note: Cash payments are not included in pending (they're immediately paid)
      // Only cheques and ongoing payments (no payment records) are pending
      let hasPendingCheque = false;
      let hasOngoingPayment = false;
      let totalPendingCheque = 0;
      let totalOngoingAmount = 0;
      
      sales.forEach(sale => {
        if (sale.pendingCheque > 0) {
          hasPendingCheque = true;
          totalPendingCheque += sale.pendingCheque;
        }
        // Ongoing payment = sale with no payment records (pendingCash > 0 means no payment records)
        if (sale.pendingCash > 0) {
          hasOngoingPayment = true;
          totalOngoingAmount += sale.pendingCash;
        }
      });
      
      let paymentStatus = 'paid';
      if (hasPendingCheque && hasOngoingPayment) {
        paymentStatus = 'cheque'; // Show cheque status if both exist (cheque takes priority)
      } else if (hasPendingCheque) {
        paymentStatus = 'cheque';
      } else if (hasOngoingPayment) {
        paymentStatus = 'ongoing';
      }
      
      formattedData.push({
        id: buyer.id,
        shopName: buyer.shop_name,
        contact: buyer.contact,
        address: buyer.address,
        latitude: buyer.latitude ? parseFloat(buyer.latitude) : null,
        longitude: buyer.longitude ? parseFloat(buyer.longitude) : null,
        isActive: buyer.is_active,
        createdAt: buyer.created_at,
        updatedAt: buyer.updated_at,
        paymentStatus,
        pendingCashAmount: totalOngoingAmount, // Only ongoing payments (no payment records)
        pendingChequeAmount: totalPendingCheque,
        sales: sales
      });
    }
    
    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error getting buyers with payment status:', error);
    next(error);
  }
};




