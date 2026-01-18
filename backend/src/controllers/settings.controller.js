// Settings Controller
import pool from '../config/db.js';

// Get milk price setting
export const getMilkPrice = async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT value FROM settings WHERE key = 'milk_price_per_liter'"
    );
    
    const price = result.rows.length > 0 
      ? parseFloat(result.rows[0].value) 
      : 200; // Default price
    
    res.json({ success: true, data: { price } });
  } catch (error) {
    console.error('Error getting milk price:', error);
    next(error);
  }
};

// Update milk price setting
export const updateMilkPrice = async (req, res, next) => {
  try {
    const { price } = req.body;
    const userId = req.user?.userId;
    
    if (!price || price <= 0) {
      return res.status(400).json({ success: false, message: 'Valid price is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO settings (key, value, updated_by)
       VALUES ('milk_price_per_liter', $1, $2)
       ON CONFLICT (key) 
       DO UPDATE SET value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [price.toString(), userId]
    );
    
    res.json({ 
      success: true, 
      data: { price: parseFloat(result.rows[0].value) },
      message: 'Milk price updated successfully' 
    });
  } catch (error) {
    console.error('Error updating milk price:', error);
    next(error);
  }
};

// Get setting by key
export const getSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const result = await pool.query('SELECT key, value FROM settings WHERE key = $1', [key]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Setting not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error getting setting:', error);
    next(error);
  }
};

// Update setting by key
export const updateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const userId = req.user?.userId;
    
    if (!value) {
      return res.status(400).json({ success: false, message: 'Value is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) 
       DO UPDATE SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING key, value`,
      [key, value, userId]
    );
    
    res.json({ 
      success: true, 
      data: result.rows[0],
      message: 'Setting updated successfully' 
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    next(error);
  }
};




