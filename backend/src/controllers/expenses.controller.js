// Expenses Controller
import pool from '../config/db.js';

// Get all expenses
export const getAllExpenses = async (req, res, next) => {
  try {
    const { startDate, endDate, category } = req.query;
    const userRole = String(req.user.role || '').toUpperCase();
    const userId = req.user.userId;
    
    // For salespersons, only show their own expenses
    // For admins, show all expenses with salesperson name
    let query = '';
    const params = [];
    
    if (userRole === 'SALESPERSON') {
      query = `
        SELECT e.*, u.name as salesperson_name, u.username as salesperson_username
        FROM expenses e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.created_by = $1
      `;
      params.push(userId);
    } else {
      query = `
        SELECT e.*, u.name as salesperson_name, u.username as salesperson_username
        FROM expenses e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE 1=1
      `;
    }
    
    if (startDate) {
      params.push(startDate);
      query += ` AND e.date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND e.date <= $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND e.category = $${params.length}`;
    }
    
    query += ' ORDER BY e.date DESC, e.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get single expense
export const getExpenseById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRole = String(req.user.role || '').toUpperCase();
    const userId = req.user.userId;
    
    const result = await pool.query(
      `SELECT e.*, u.name as salesperson_name, u.username as salesperson_username
       FROM expenses e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    
    // Salespersons can only view their own expenses
    if (userRole === 'SALESPERSON' && result.rows[0].created_by !== userId) {
      return res.status(403).json({ success: false, message: 'You can only view your own expenses' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create expense
export const createExpense = async (req, res, next) => {
  try {
    const { category, amount, date, description, type } = req.body;
    const userId = req.user.userId;
    
    if (!category || !amount) {
      return res.status(400).json({ success: false, message: 'Category and amount are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO expenses (category, amount, date, description, type, created_by)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, COALESCE($5, 'operational'), $6)
       RETURNING *`,
      [category, amount, date, description || null, type, userId]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Expense created successfully' });
  } catch (error) {
    next(error);
  }
};

// Update expense
export const updateExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, amount, date, description, type } = req.body;
    const userRole = String(req.user.role || '').toUpperCase();
    const userId = req.user.userId;
    
    // Check if expense exists and if user has permission to update it
    const checkResult = await pool.query('SELECT created_by FROM expenses WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    
    // Salespersons can only update their own expenses
    if (userRole === 'SALESPERSON' && checkResult.rows[0].created_by !== userId) {
      return res.status(403).json({ success: false, message: 'You can only update your own expenses' });
    }
    
    const result = await pool.query(
      `UPDATE expenses 
       SET category = COALESCE($1, category),
           amount = COALESCE($2, amount),
           date = COALESCE($3, date),
           description = COALESCE($4, description),
           type = COALESCE($5, type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [category, amount, date, description, type, id]
    );
    
    res.json({ success: true, data: result.rows[0], message: 'Expense updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete expense
export const deleteExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRole = String(req.user.role || '').toUpperCase();
    const userId = req.user.userId;
    
    // Check if expense exists and if user has permission to delete it
    const checkResult = await pool.query('SELECT created_by FROM expenses WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    
    // Salespersons can only delete their own expenses
    if (userRole === 'SALESPERSON' && checkResult.rows[0].created_by !== userId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own expenses' });
    }
    
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
    
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Get monthly expenses
export const getMonthlyExpenses = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const result = await pool.query(`
      SELECT 
        category,
        SUM(amount) as total,
        COUNT(*) as count
      FROM expenses
      WHERE EXTRACT(YEAR FROM date) = COALESCE($1, EXTRACT(YEAR FROM CURRENT_DATE))
        AND EXTRACT(MONTH FROM date) = COALESCE($2, EXTRACT(MONTH FROM CURRENT_DATE))
      GROUP BY category
      ORDER BY total DESC
    `, [year, month]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

