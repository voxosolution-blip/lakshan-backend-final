// Authentication Middleware
import jwt from 'jsonwebtoken';

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_in_production';
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, role, username }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Role-based authorization middleware
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Optional debug logging (enable with DEBUG_AUTH=true)
    if (String(process.env.DEBUG_AUTH || '').toLowerCase() === 'true') {
      console.log('Authorization check:', {
        userRole: req.user.role,
        userRoleType: typeof req.user.role,
        allowedRoles: allowedRoles,
        userId: req.user.userId,
        username: req.user.username
      });
    }

    // Case-insensitive role check
    const userRoleUpper = String(req.user.role || '').toUpperCase();
    const allowedRolesUpper = allowedRoles.map(r => String(r).toUpperCase());
    
    if (!allowedRolesUpper.includes(userRoleUpper)) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}, Your role: ${req.user.role || 'undefined'}`
      });
    }

    next();
  };
};





