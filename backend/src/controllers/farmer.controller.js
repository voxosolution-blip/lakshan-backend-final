// Farmer Controller
import pool from '../config/db.js';

// Get all farmers with today's milk summary
export const getAllFarmersWithTodayMilk = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(`
      SELECT 
        f.id,
        f.name,
        f.phone,
        f.address,
        f.milk_rate,
        f.allowance,
        f.is_active,
        COALESCE(SUM(CASE WHEN mc.date = $1 THEN mc.quantity_liters ELSE 0 END), 0) as today_milk
      FROM farmers f
      LEFT JOIN milk_collections mc ON f.id = mc.farmer_id
      WHERE f.is_active = true
      GROUP BY f.id, f.name, f.phone, f.address, f.milk_rate, f.allowance, f.is_active
      ORDER BY f.name
    `, [today]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getting farmers with today milk:', error);
    next(error);
  }
};

// Get all farmers (simple list)
export const getAllFarmers = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, phone, address, milk_rate, allowance, is_active FROM farmers WHERE is_active = true ORDER BY name'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get single farmer
export const getFarmerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM farmers WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Farmer not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create farmer (simplified - no milk_rate or allowance)
export const createFarmer = async (req, res, next) => {
  try {
    const { name, phone, address } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO farmers (name, phone, address, milk_rate, allowance)
       VALUES ($1, $2, $3, 0, 0)
       RETURNING id, name, phone, address, is_active, created_at`,
      [name, phone || null, address || null]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Farmer created successfully' });
  } catch (error) {
    next(error);
  }
};

// Update farmer
export const updateFarmer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, address } = req.body;
    
    const result = await pool.query(
      `UPDATE farmers 
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, name, phone, address, is_active, created_at, updated_at`,
      [name, phone, address, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Farmer not found' });
    }
    
    res.json({ success: true, data: result.rows[0], message: 'Farmer updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete farmer
export const deleteFarmer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('UPDATE farmers SET is_active = false WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Farmer not found' });
    }
    
    res.json({ success: true, message: 'Farmer deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Add milk collection (auto-adds to raw materials inventory)
export const addMilkCollection = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { farmerId, date, time, quantity_liters } = req.body;
    
    if (!farmerId || !quantity_liters) {
      return res.status(400).json({ success: false, message: 'Farmer ID and quantity are required' });
    }
    
    await client.query('BEGIN');
    
    // Insert milk collection
    const result = await client.query(
      `INSERT INTO milk_collections (farmer_id, date, time, quantity_liters)
       VALUES ($1, COALESCE($2, CURRENT_DATE), COALESCE($3, CURRENT_TIME), $4)
       RETURNING *`,
      [farmerId, date, time, quantity_liters]
    );
    
    // Auto-add to raw materials inventory (Milk item)
    // First, get or create the Raw Materials category
    let categoryId;
    const categoryResult = await client.query(
      `SELECT id FROM inventory_categories 
       WHERE name IN ('Raw Materials', 'Raw Material')
       LIMIT 1`
    );
    
    if (categoryResult.rows.length === 0) {
      // Create category if it doesn't exist
      const newCategoryResult = await client.query(
        `INSERT INTO inventory_categories (name, description)
         VALUES ('Raw Materials', 'Raw materials including milk, sugar, starter culture, etc.')
         RETURNING id`
      );
      categoryId = newCategoryResult.rows[0].id;
    } else {
      categoryId = categoryResult.rows[0].id;
    }
    
    // Calculate total milk collected (all collections)
    const totalCollectedResult = await client.query(
      `SELECT COALESCE(SUM(quantity_liters), 0) as total_collected
       FROM milk_collections`
    );
    const totalCollected = parseFloat(totalCollectedResult.rows[0].total_collected || 0);
    
    // Calculate total milk used in production (from product BOM where ingredient is Milk)
    // Convert quantity_required to liters if needed (BOM unit to inventory unit)
    // Special handling: kg ↔ liter conversion for milk (1 kg ≈ 1 liter)
    const milkUsedResult = await client.query(
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
       JOIN inventory_items i ON pb.inventory_item_id = i.id
       WHERE i.name = 'Milk' AND i.category_id = $1`,
      [categoryId]
    );
    const totalUsed = parseFloat(milkUsedResult.rows[0].total_used || 0);
    
    // Calculate available milk = collected - used
    // Ensure it never goes below 0 (database constraint)
    const calculatedMilk = totalCollected - totalUsed;
    const availableMilk = Math.max(0, calculatedMilk);
    
    // Warn if calculated value is negative (data inconsistency)
    if (calculatedMilk < 0) {
      console.warn(`⚠️  Warning: Milk usage (${totalUsed.toFixed(2)}L) exceeds collection (${totalCollected.toFixed(2)}L). Setting to 0.`);
    }
    
    // Check if Milk inventory item exists
    const milkItemResult = await client.query(
      `SELECT id FROM inventory_items 
       WHERE name = 'Milk' 
       AND category_id = $1
       LIMIT 1`,
      [categoryId]
    );
    
    if (milkItemResult.rows.length > 0) {
      // Update existing milk inventory with calculated value
      await client.query(
        `UPDATE inventory_items 
         SET quantity = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [availableMilk, milkItemResult.rows[0].id]
      );
      console.log(`✓ Milk inventory updated: ${totalCollected}L collected - ${totalUsed}L used = ${availableMilk}L available`);
    } else {
      // Create milk inventory item
      await client.query(
        `INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity)
         VALUES ('Milk', $1, 'liter', $2, 100)
         RETURNING id`,
        [categoryId, availableMilk]
      );
      console.log(`✓ Milk inventory item created with ${availableMilk}L available`);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      data: {
        ...result.rows[0],
        inventoryUpdated: true,
        milkInventoryQuantity: availableMilk,
        totalCollected: totalCollected,
        totalUsed: totalUsed
      }, 
      message: `Milk collection added successfully. ${quantity_liters}L collected. Total available: ${availableMilk.toFixed(2)}L (${totalCollected.toFixed(2)}L collected - ${totalUsed.toFixed(2)}L used)` 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in addMilkCollection:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      farmerId: req.body?.farmerId,
      quantity_liters: req.body?.quantity_liters
    });
    next(error);
  } finally {
    client.release();
  }
};

// Get farmer monthly report
export const getFarmerMonthlyReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { year, month } = req.query;
    
    // Get farmer details
    const farmerResult = await pool.query('SELECT * FROM farmers WHERE id = $1', [id]);
    if (farmerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Farmer not found' });
    }
    const farmer = farmerResult.rows[0];
    
    // Determine date range
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1;
    
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);
    
    // Get milk collections for the month
    const collectionsResult = await pool.query(`
      SELECT id, date, time, quantity_liters, created_at
      FROM milk_collections
      WHERE farmer_id = $1 
        AND date >= $2 
        AND date <= $3
      ORDER BY date DESC, time DESC
    `, [id, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);
    
    // Calculate totals
    const totalLiters = collectionsResult.rows.reduce((sum, row) => 
      sum + parseFloat(row.quantity_liters || 0), 0
    );
    
    // Get milk price from settings
    const priceResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'milk_price_per_liter'"
    );
    const milkPrice = priceResult.rows.length > 0 
      ? parseFloat(priceResult.rows[0].value) 
      : parseFloat(farmer.milk_rate || 200);
    
    const totalPayment = totalLiters * milkPrice;
    
    // Get free products for the month (if missing, fall back to global defaults from settings)
    let freeProductsRows = [];

    const freeProductsResult = await pool.query(
      `SELECT ffp.id, ffp.quantity, ffp.unit, ffp.notes,
              ffp.product_id,
              p.name as product_name
       FROM farmer_free_products ffp
       LEFT JOIN products p ON ffp.product_id = p.id
       WHERE ffp.farmer_id = $1 AND ffp.year = $2 AND ffp.month = $3
       ORDER BY ffp.created_at ASC`,
      [id, targetYear, targetMonth]
    );
    freeProductsRows = freeProductsResult.rows || [];

    if (freeProductsRows.length === 0) {
      // Load defaults from settings: farmer_default_free_products = JSON array [{product_id, quantity, unit}]
      const defaultsRes = await pool.query(`SELECT value FROM settings WHERE key='farmer_default_free_products' LIMIT 1`);
      const raw = defaultsRes.rows[0]?.value;
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Resolve product names
          const ids = parsed.map((x) => x?.product_id).filter(Boolean);
          const prodRes =
            ids.length > 0
              ? await pool.query(`SELECT id, name FROM products WHERE id = ANY($1)`, [ids])
              : { rows: [] };
          const nameById = new Map(prodRes.rows.map((r) => [r.id, r.name]));

          freeProductsRows = parsed
            .filter((x) => x?.product_id && parseFloat(x?.quantity || 0) > 0)
            .map((x) => ({
              id: null,
              product_id: x.product_id,
              product_name: nameById.get(x.product_id) || null,
              quantity: x.quantity,
              unit: x.unit || 'piece',
              notes: null
            }));
        }
      } catch {
        // ignore invalid JSON
      }
    }
    
    res.json({
      success: true,
      data: {
        farmer: {
          id: farmer.id,
          name: farmer.name,
          phone: farmer.phone,
          address: farmer.address,
        },
        period: {
          year: targetYear,
          month: targetMonth,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        },
        collections: collectionsResult.rows,
        summary: {
          totalLiters: totalLiters,
          milkPrice: milkPrice,
          totalPayment: totalPayment,
          collectionCount: collectionsResult.rows.length,
        },
        freeProducts: (freeProductsRows || []).map((row) => ({
          id: row.id,
          productId: row.product_id,
          productName: row.product_name,
          quantity: parseFloat(row.quantity || 0),
          unit: row.unit,
          notes: row.notes
        }))
      }
    });
  } catch (error) {
    console.error('Error in getFarmerMonthlyReport:', error);
    next(error);
  }
};

// Add free products for farmer
export const addFarmerFreeProducts = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { farmerId, month, year, items } = req.body;
    
    if (!farmerId || !month || !year || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Farmer ID, month, year, and items are required' });
    }
    
    await client.query('BEGIN');
    
    const results = [];
    for (const item of items) {
      const { product_id, quantity, unit, notes } = item;
      
      if (!product_id || !quantity) {
        throw new Error('Product ID and quantity are required');
      }
      
      // Insert free product (upsert to handle duplicates)
      const result = await client.query(
        `INSERT INTO farmer_free_products (farmer_id, month, year, product_id, quantity, unit, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (farmer_id, year, month, product_id) 
         DO UPDATE SET 
           quantity = EXCLUDED.quantity,
           unit = EXCLUDED.unit,
           notes = EXCLUDED.notes,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [farmerId, parseInt(month), parseInt(year), product_id, 
         parseFloat(quantity), unit || 'piece', notes || null]
      );
      
      results.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ success: true, data: results, message: 'Free products recorded successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding farmer free products:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Issue (deduct) farmer free products for a month (idempotent: reprints won't deduct twice)
export const issueFarmerFreeProducts = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params; // farmerId
    const { year, month } = req.body || {};
    const userId = req.user?.userId || null;

    if (!id || !year || !month) {
      return res.status(400).json({ success: false, message: 'farmerId, year and month are required' });
    }

    await client.query('BEGIN');

    const targetYear = parseInt(year);
    const targetMonth = parseInt(month);

    const loadRowsForUpdate = async () => {
      return await client.query(
        `SELECT ffp.id, ffp.product_id, ffp.quantity, ffp.unit, ffp.issued_at, p.name AS product_name
         FROM farmer_free_products ffp
         LEFT JOIN products p ON p.id = ffp.product_id
         WHERE ffp.farmer_id = $1 AND ffp.year = $2 AND ffp.month = $3
         ORDER BY ffp.created_at ASC
         FOR UPDATE OF ffp`,
        [id, targetYear, targetMonth]
      );
    };

    // Lock rows for this farmer/month so issuing is safe even with double-click.
    // If no rows exist, auto-create from global defaults (farmer_default_free_products).
    let freeRows = await loadRowsForUpdate();

    if (freeRows.rows.length === 0) {
      const defaultsRes = await client.query(`SELECT value FROM settings WHERE key='farmer_default_free_products' LIMIT 1`);
      const raw = defaultsRes.rows[0]?.value;
      let defaults = [];
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        defaults = Array.isArray(parsed) ? parsed : [];
      } catch {
        defaults = [];
      }

      for (const item of defaults) {
        const productId = item?.product_id;
        const qty = parseFloat(item?.quantity || 0);
        const unit = item?.unit || 'piece';
        if (!productId || !(qty > 0)) continue;

        await client.query(
          `INSERT INTO farmer_free_products (farmer_id, month, year, product_id, quantity, unit, notes)
           VALUES ($1, $2, $3, $4, $5, $6, NULL)
           ON CONFLICT (farmer_id, year, month, product_id)
           DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit, updated_at = CURRENT_TIMESTAMP`,
          [id, targetMonth, targetYear, productId, qty, unit]
        );
      }

      freeRows = await loadRowsForUpdate();
    }

    if (freeRows.rows.length === 0) {
      await client.query('COMMIT');
      return res.json({ success: true, data: { issued: 0, alreadyIssued: 0, deducted: [] }, message: 'No free products for this month' });
    }

    const toIssue = freeRows.rows.filter((r) => !r.issued_at);
    const alreadyIssued = freeRows.rows.length - toIssue.length;

    const deducted = [];

    for (const r of toIssue) {
      const qty = parseFloat(r.quantity || 0);
      if (!(qty > 0)) continue;
      const productName = r.product_name;
      if (!productName) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Free product is missing product mapping' });
      }

      // Find inventory item in Finished Goods (be tolerant to category naming)
      const inv = await client.query(
        `SELECT ii.id, ii.quantity
         FROM inventory_items ii
         JOIN inventory_categories ic ON ii.category_id = ic.id
         WHERE ii.name = $1 AND ic.name ILIKE '%Finished%'
         LIMIT 1
         FOR UPDATE`,
        [productName]
      );

      if (inv.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Finished Goods inventory item not found for product: ${productName}`
        });
      }

      const currentQty = parseFloat(inv.rows[0].quantity || 0);
      if (currentQty < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${productName}. Available: ${currentQty.toFixed(2)}, Required: ${qty.toFixed(2)}`
        });
      }

      await client.query(
        `UPDATE inventory_items
         SET quantity = quantity - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [qty, inv.rows[0].id]
      );

      await client.query(
        `UPDATE farmer_free_products
         SET issued_at = CURRENT_TIMESTAMP,
             issued_by = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [userId, r.id]
      );

      deducted.push({ productName, quantity: qty });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      data: { issued: toIssue.length, alreadyIssued, deducted },
      message: toIssue.length > 0 ? 'Free products issued and inventory updated' : 'Free products already issued'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

// Get total milk inventory
export const getTotalMilkInventory = async (req, res, next) => {
  try {
    // Get Raw Materials category ID
    const categoryResult = await pool.query(
      `SELECT id FROM inventory_categories 
       WHERE name IN ('Raw Materials', 'Raw Material')
       LIMIT 1`
    );
    
    const categoryId = categoryResult.rows.length > 0 ? categoryResult.rows[0].id : null;
    
    const totalResult = await pool.query(`
      SELECT 
        COALESCE(SUM(quantity_liters), 0) as total_collected,
        COUNT(*) as collection_count,
        COUNT(DISTINCT farmer_id) as farmer_count
      FROM milk_collections
    `);
    
    // Calculate current stock dynamically: totalCollected - totalUsed
    // This ensures real-time accuracy and matches the calculation in addMilkCollection
    let currentStock = 0;
    let totalUsed = 0;
    
    if (categoryId) {
      try {
        // Calculate total milk used in production
        const milkUsedResult = await pool.query(
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
        totalUsed = parseFloat(milkUsedResult.rows[0]?.total_used || 0);
      } catch (err) {
        console.log('Error calculating milk usage:', err);
      }
    }
    
    const totalCollected = parseFloat(totalResult.rows[0]?.total_collected || 0);
    // Calculate available milk = collected - used (never negative)
    currentStock = Math.max(0, totalCollected - totalUsed);
    
    const monthResult = await pool.query(`
      SELECT COALESCE(SUM(quantity_liters), 0) as current_month_total
      FROM milk_collections
      WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
    `);
    
    res.json({
      success: true,
      data: {
        currentStock: currentStock,
        totalCollected: totalCollected,
        totalUsed: totalUsed,
        farmerCount: parseInt(totalResult.rows[0]?.farmer_count || 0),
        collectionCount: parseInt(totalResult.rows[0]?.collection_count || 0),
        currentMonthTotal: parseFloat(monthResult.rows[0]?.current_month_total || 0)
      }
    });
  } catch (error) {
    console.error('Error in getTotalMilkInventory:', error);
    next(error);
  }
};
