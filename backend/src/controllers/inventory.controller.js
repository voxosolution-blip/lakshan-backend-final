// Inventory Controller
import pool from '../config/db.js';

// Helper function to find category ID by name (handles variations)
async function findCategoryId(categoryValue) {
  if (!categoryValue) return null;
  
  const categoryValueStr = String(categoryValue).trim();
  const normalizedCategory = categoryValueStr.toLowerCase().replace(/[_-]/g, ' ').trim();
  
  // Define possible category names to try (in order of preference)
  // Note: Migration may have updated categories to plural, so try both
  const categoryMapping = {
    // Raw Material variations - try plural first (migration updated it)
    'raw material': ['Raw Materials', 'Raw Material'],
    'raw materials': ['Raw Materials', 'Raw Material'],
    'rawmaterial': ['Raw Materials', 'Raw Material'],
    'rawmaterials': ['Raw Materials', 'Raw Material'],
    // Packaging variations - try plural first
    'packaging': ['Packaging Materials', 'Packaging'],
    'packaging materials': ['Packaging Materials', 'Packaging'],
    'packagingmaterials': ['Packaging Materials', 'Packaging'],
    // Finished Goods variations
    'finished goods': ['Finished Goods'],
    'finished product': ['Finished Goods'],
    'finishedgoods': ['Finished Goods'],
    'finishedproduct': ['Finished Goods'],
    // Utilities variations - try with & Energy first
    'utilities': ['Utilities & Energy', 'Utilities'],
    'utilities energy': ['Utilities & Energy', 'Utilities'],
    'utilities & energy': ['Utilities & Energy', 'Utilities'],
  };
  
  // Get possible category names to try
  let categoryNamesToTry = categoryMapping[normalizedCategory] || [categoryValueStr];
  
  // Also add common variations based on keywords - try plural first (after migration)
  if (normalizedCategory.includes('raw') && normalizedCategory.includes('material')) {
    categoryNamesToTry = ['Raw Materials', 'Raw Material', categoryValueStr];
    // Also add variations without spaces
    categoryNamesToTry.push('RawMaterials', 'RawMaterial');
  } else if (normalizedCategory.includes('packaging')) {
    categoryNamesToTry = ['Packaging Materials', 'Packaging', categoryValueStr];
  } else if (normalizedCategory.includes('finished')) {
    categoryNamesToTry = ['Finished Goods', categoryValueStr];
  } else if (normalizedCategory.includes('utilit')) {
    categoryNamesToTry = ['Utilities & Energy', 'Utilities', categoryValueStr];
  }
  
  // Always try the original value as a fallback
  if (!categoryNamesToTry.includes(categoryValueStr)) {
    categoryNamesToTry.push(categoryValueStr);
  }
  
  // Try each possible category name
  for (const catName of categoryNamesToTry) {
    const result = await pool.query(
      'SELECT id, name FROM inventory_categories WHERE LOWER(TRIM(name)) = LOWER($1)',
      [catName]
    );
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }
  
  return null;
}

// Helper function to convert units (kg to g, etc.)
function convertUnit(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  
  const conversions = {
    'kg': { 'g': 1000, 'kg': 1 },
    'g': { 'kg': 0.001, 'g': 1 },
    'liter': { 'ml': 1000, 'liter': 1 },
    'ml': { 'liter': 0.001, 'ml': 1 },
    'piece': { 'piece': 1 }
  };
  
  if (conversions[fromUnit] && conversions[fromUnit][toUnit]) {
    return value * conversions[fromUnit][toUnit];
  }
  
  return value; // Return as-is if conversion not found
}

// Get all inventory items
export const getAllInventory = async (req, res, next) => {
  try {
    const { category } = req.query;
    
    let query = `
      SELECT 
        i.id,
        i.name,
        i.unit,
        i.quantity as current_stock,
        i.min_quantity as min_stock_level,
        i.price,
        i.expiry_date,
        i.created_at,
        i.updated_at,
        c.id as category_id,
        COALESCE(c.name, 'Unknown') as category_name,
        CASE 
          WHEN LOWER(c.name) = 'raw materials' THEN 'raw_material'
          WHEN LOWER(c.name) = 'packaging materials' THEN 'packaging'
          WHEN LOWER(c.name) = 'finished goods' THEN 'finished_product'
          WHEN LOWER(c.name) = 'utilities & energy' THEN 'utilities'
          WHEN LOWER(c.name) = 'raw material' THEN 'raw_material'
          WHEN LOWER(c.name) = 'packaging' THEN 'packaging'
          WHEN LOWER(c.name) = 'finished goods' THEN 'finished_product'
          WHEN LOWER(c.name) = 'utilities' THEN 'utilities'
          ELSE LOWER(REPLACE(c.name, ' ', '_'))
        END as category
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    if (category) {
      params.push(category);
      query += ` AND LOWER(c.name) = LOWER($${params.length})`;
    }
    
    query += ' ORDER BY c.name, i.name';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get milk inventory by date (from milk collections)
export const getMilkInventoryByDate = async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get total milk collected for the date
    const collectionResult = await pool.query(
      `SELECT COALESCE(SUM(quantity_liters), 0) as total_collected
       FROM milk_collections
       WHERE date = $1`,
      [targetDate]
    );
    
    // Get current milk inventory stock
    const inventoryResult = await pool.query(
      `SELECT i.id, i.name, i.quantity, i.unit
       FROM inventory_items i
       JOIN inventory_categories c ON i.category_id = c.id
       WHERE i.name = 'Milk' AND c.name = 'Raw Materials'
       LIMIT 1`
    );
    
    res.json({
      success: true,
      data: {
        date: targetDate,
        collectedToday: parseFloat(collectionResult.rows[0]?.total_collected || 0),
        currentStock: inventoryResult.rows.length > 0 
          ? parseFloat(inventoryResult.rows[0].quantity || 0)
          : 0,
        inventoryItem: inventoryResult.rows[0] || null
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single inventory item
export const getInventoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        i.id,
        i.name,
        i.unit,
        i.quantity as current_stock,
        i.min_quantity as min_stock_level,
        i.price,
        i.expiry_date,
        i.created_at,
        i.updated_at,
        COALESCE(c.name, 'Unknown') as category_name,
        CASE 
          WHEN LOWER(c.name) = 'raw material' THEN 'raw_material'
          WHEN LOWER(c.name) = 'packaging' THEN 'packaging'
          WHEN LOWER(c.name) = 'finished goods' THEN 'finished_product'
          WHEN LOWER(c.name) = 'utilities' THEN 'utilities'
          ELSE LOWER(REPLACE(c.name, ' ', '_'))
        END as category
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      WHERE i.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create inventory item
export const createInventory = async (req, res, next) => {
  try {
    const {
      name,
      category,
      category_id,
      unit,
      // stock/quantity aliases
      current_stock,
      currentStock,
      quantity,
      minimum_stock,
      minStockLevel,
      price,
      expiry_date,
      expiryDate,
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    // Handle category - accept either category_id (UUID) or category (name string)
    let finalCategoryId = category_id;
    
    if (!finalCategoryId && category) {
      finalCategoryId = await findCategoryId(category);
      
      if (!finalCategoryId) {
        // Get available categories for error message
        const availableCategories = await pool.query('SELECT name FROM inventory_categories ORDER BY name');
        const categoryList = availableCategories.rows.map(c => c.name).join(', ');
        return res.status(400).json({ 
          success: false, 
          message: `Category "${category}" not found. Available categories: ${categoryList}` 
        });
      }
    }
    
    if (!finalCategoryId) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }
    
    // Handle field name variations
    const finalCurrentStock =
      quantity !== undefined
        ? quantity
        : current_stock !== undefined
          ? current_stock
          : currentStock !== undefined
            ? currentStock
            : 0;

    const finalMinimumStock = minimum_stock !== undefined ? minimum_stock : minStockLevel || 0;
    const finalExpiryDate = expiry_date || expiryDate || null;
    
    const result = await pool.query(
      `INSERT INTO inventory_items (name, category_id, unit, quantity, min_quantity, price, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, finalCategoryId, unit || 'liter', finalCurrentStock, finalMinimumStock, price || 0, finalExpiryDate]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Inventory item created successfully' });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    next(error);
  }
};

// Update inventory item
export const updateInventory = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if this is the Milk item - prevent manual updates
    const itemCheck = await pool.query(
      `SELECT i.name, c.name as category_name
       FROM inventory_items i
       JOIN inventory_categories c ON i.category_id = c.id
       WHERE i.id = $1`,
      [id]
    );
    
    if (itemCheck.rows.length > 0) {
      const item = itemCheck.rows[0];
      if (item.name === 'Milk' && (item.category_name === 'Raw Materials' || item.category_name === 'Raw Material')) {
        return res.status(400).json({
          success: false,
          message: 'Milk inventory is automatically managed from milk collections. Cannot be edited manually. Milk inventory = Today\'s collection + Previous days\' remaining milk.'
        });
      }
    }
    const {
      name,
      category,
      category_id,
      unit,
      // stock/quantity aliases
      current_stock,
      currentStock,
      quantity,
      minimum_stock,
      minStockLevel,
      price,
      expiry_date,
      expiryDate,
    } = req.body;
    
    // Handle category - accept either category_id (UUID) or category (name string)
    let finalCategoryId = category_id;
    
    if (!finalCategoryId && category) {
      finalCategoryId = await findCategoryId(category);
    }
    
    // Handle field name variations - database uses 'quantity' and 'min_quantity'
    const finalQuantity =
      quantity !== undefined
        ? quantity
        : current_stock !== undefined
          ? current_stock
          : currentStock !== undefined
            ? currentStock
            : undefined;
    const finalMinQuantity = minimum_stock !== undefined ? minimum_stock : (minStockLevel !== undefined ? minStockLevel : undefined);
    const finalExpiryDate = expiry_date !== undefined ? expiry_date : (expiryDate !== undefined ? expiryDate : undefined);
    
    const result = await pool.query(
      `UPDATE inventory_items 
       SET name = COALESCE($1, name),
           category_id = COALESCE($2, category_id),
           unit = COALESCE($3, unit),
           quantity = COALESCE($4, quantity),
           min_quantity = COALESCE($5, min_quantity),
           price = COALESCE($6, price),
           expiry_date = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, finalCategoryId, unit, finalQuantity, finalMinQuantity, price, finalExpiryDate || null, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    
    res.json({ success: true, data: result.rows[0], message: 'Inventory item updated successfully' });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    next(error);
  }
};

// Delete inventory item
export const deleteInventory = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if this is the Milk item - prevent deletion
    const itemCheck = await pool.query(
      `SELECT i.name, c.name as category_name
       FROM inventory_items i
       JOIN inventory_categories c ON i.category_id = c.id
       WHERE i.id = $1`,
      [id]
    );
    
    if (itemCheck.rows.length > 0) {
      const item = itemCheck.rows[0];
      if (item.name === 'Milk' && (item.category_name === 'Raw Materials' || item.category_name === 'Raw Material')) {
        return res.status(400).json({
          success: false,
          message: 'Milk inventory item cannot be deleted. It is automatically managed from milk collections.'
        });
      }
    }
    
    const result = await pool.query('DELETE FROM inventory_items WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    
    res.json({ success: true, message: 'Inventory item deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Adjust stock
export const adjustStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adjustment, reason } = req.body;
    
    if (adjustment === undefined) {
      return res.status(400).json({ success: false, message: 'Adjustment amount is required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check if this is the Milk item - prevent manual adjustments
      const itemCheck = await client.query(
        `SELECT i.name, c.name as category_name
         FROM inventory_items i
         JOIN inventory_categories c ON i.category_id = c.id
         WHERE i.id = $1`,
        [id]
      );
      
      if (itemCheck.rows.length > 0) {
        const item = itemCheck.rows[0];
        if (item.name === 'Milk' && (item.category_name === 'Raw Materials' || item.category_name === 'Raw Material')) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Milk inventory is automatically managed from milk collections. Cannot be adjusted manually. Milk inventory = Today\'s collection + Previous days\' remaining milk.'
          });
        }
      }
      
      // Get current stock (database column is 'quantity')
      const currentResult = await client.query('SELECT quantity FROM inventory_items WHERE id = $1', [id]);
      if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Inventory item not found' });
      }
      
      const newStock = parseFloat(currentResult.rows[0].quantity) + parseFloat(adjustment);
      
      if (newStock < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }
      
      // Update stock
      const updateResult = await client.query(
        `UPDATE inventory_items 
         SET quantity = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [newStock, id]
      );
      
      await client.query('COMMIT');
      res.json({ success: true, data: updateResult.rows[0], message: 'Stock adjusted successfully' });
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

// Get low stock alerts
export const getLowStockAlerts = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.id,
        i.name,
        i.quantity as current_stock,
        i.min_quantity as min_stock_level,
        i.unit,
        i.price,
        i.expiry_date,
        i.created_at,
        i.updated_at,
        c.id as category_id,
        COALESCE(c.name, 'Unknown') as category_name,
        CASE 
          WHEN LOWER(c.name) = 'raw materials' THEN 'raw_material'
          WHEN LOWER(c.name) = 'packaging materials' THEN 'packaging'
          WHEN LOWER(c.name) = 'finished goods' THEN 'finished_product'
          WHEN LOWER(c.name) = 'utilities & energy' THEN 'utilities'
          WHEN LOWER(c.name) = 'raw material' THEN 'raw_material'
          WHEN LOWER(c.name) = 'packaging' THEN 'packaging'
          WHEN LOWER(c.name) = 'finished goods' THEN 'finished_product'
          WHEN LOWER(c.name) = 'utilities' THEN 'utilities'
          ELSE LOWER(REPLACE(c.name, ' ', '_'))
        END as category
      FROM inventory_items i
      JOIN inventory_categories c ON i.category_id = c.id
      WHERE i.quantity < i.min_quantity AND i.min_quantity > 0
      ORDER BY i.name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get today's milk usage
export const getTodayMilkUsage = async (req, res, next) => {
  try {
    // Get Raw Materials category ID
    const categoryResult = await pool.query(
      `SELECT id FROM inventory_categories 
       WHERE name IN ('Raw Materials', 'Raw Material')
       LIMIT 1`
    );
    
    if (categoryResult.rows.length === 0) {
      return res.json({ success: true, data: { todayUsage: 0 } });
    }
    
    const categoryId = categoryResult.rows[0].id;
    
    // Get today's milk usage from productions
    const usageResult = await pool.query(`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN pb.unit = 'liter' OR pb.unit = 'l' THEN p.quantity_produced * pb.quantity_required
            WHEN pb.unit = 'ml' THEN p.quantity_produced * pb.quantity_required / 1000.0
            WHEN pb.unit = 'kg' THEN p.quantity_produced * pb.quantity_required
            ELSE p.quantity_produced * pb.quantity_required
          END
        ), 0) as today_used
      FROM productions p
      JOIN product_bom pb ON p.product_id = pb.product_id
      JOIN inventory_items i ON pb.inventory_item_id = i.id
      WHERE i.name = 'Milk' 
        AND i.category_id = $1
        AND p.date = CURRENT_DATE
    `, [categoryId]);
    
    const todayUsage = parseFloat(usageResult.rows[0]?.today_used || 0);
    
    res.json({ success: true, data: { todayUsage } });
  } catch (error) {
    console.error('Error getting today milk usage:', error);
    next(error);
  }
};

// Get expiry alerts
export const getExpiryAlerts = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT * FROM v_expiry_alerts
      ORDER BY expiry_date
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

