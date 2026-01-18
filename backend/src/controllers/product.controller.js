// Product Controller
import pool from '../config/db.js';

// Get all products
export const getAllProducts = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get single product
export const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create product
export const createProduct = async (req, res, next) => {
  try {
    const { name, category, selling_price, description, is_active } = req.body;
    
    if (!name || !selling_price) {
      return res.status(400).json({ success: false, message: 'Name and selling price are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO products (name, category, selling_price, description, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, category || null, selling_price, description || null, is_active !== false]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Product created successfully' });
  } catch (error) {
    next(error);
  }
};

// Update product
export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, category, selling_price, description, is_active } = req.body;
    
    const result = await pool.query(
      `UPDATE products 
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           selling_price = COALESCE($3, selling_price),
           description = COALESCE($4, description),
           is_active = COALESCE($5, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, category, selling_price, description, is_active, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, data: result.rows[0], message: 'Product updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete product
export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Get product BOM
export const getProductBOM = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT pb.*, i.name as inventory_item_name, i.unit
      FROM product_bom pb
      JOIN inventory_items i ON pb.inventory_item_id = i.id
      WHERE pb.product_id = $1
      ORDER BY i.name
    `, [id]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Add BOM item
export const addBOMItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { inventory_item_id, quantity_required, unit } = req.body;
    
    if (!inventory_item_id || !quantity_required) {
      return res.status(400).json({ success: false, message: 'Inventory item and quantity are required' });
    }
    
    // Get the inventory item to use its unit if unit not provided
    const inventoryResult = await pool.query(
      'SELECT unit FROM inventory_items WHERE id = $1',
      [inventory_item_id]
    );
    
    if (inventoryResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    
    // Use inventory item's unit if unit not provided or use provided unit
    const unitToUse = unit || inventoryResult.rows[0].unit || 'piece';
    
    // Verify unit matches inventory item unit
    const inventoryUnit = inventoryResult.rows[0].unit || 'piece';
    if (unit && unit.toLowerCase() !== inventoryUnit.toLowerCase()) {
      // Allow unit mismatch but warn - the production controller will handle conversion
      console.log(`Warning: BOM unit "${unit}" doesn't match inventory unit "${inventoryUnit}" for item ${inventory_item_id}`);
    }
    
    const result = await pool.query(
      `INSERT INTO product_bom (product_id, inventory_item_id, quantity_required, unit)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, inventory_item_id, quantity_required, unitToUse]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'BOM item added successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete BOM item
export const deleteBOMItem = async (req, res, next) => {
  try {
    const { id, bomId } = req.params;
    const result = await pool.query(
      'DELETE FROM product_bom WHERE id = $1 AND product_id = $2 RETURNING id',
      [bomId, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'BOM item not found' });
    }
    
    res.json({ success: true, message: 'BOM item deleted successfully' });
  } catch (error) {
    next(error);
  }
};



