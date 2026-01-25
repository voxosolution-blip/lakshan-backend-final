// Authentication Controller
import pool from '../config/db.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Find user
    const userResult = await pool.query(
      'SELECT id, username, email, name, role, password_hash, is_active FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    // Return user data (without password)
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.name,
      role: user.role,
      isActive: user.is_active
    };

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  try {
    const { username, password, email, name, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, email, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, name, role, is_active, created_at`,
      [username, passwordHash, email || null, name || username, role || 'SALESPERSON']
    );

    const user = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.name,
        role: user.role,
        isActive: user.is_active
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      'SELECT id, username, email, name, role, is_active, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all salespersons (for allocation dropdowns)
export const getSalespersons = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, name, role, is_active 
       FROM users 
       WHERE role = 'SALESPERSON' AND is_active = true
       ORDER BY name, username`
    );

    res.json({
      success: true,
      data: result.rows.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name || user.username,
        role: user.role,
        isActive: user.is_active
      }))
    });
  } catch (error) {
    next(error);
  }
};




