// Error Handling Middleware
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Database errors
  if (err.code === '42703') { // Undefined column
    console.error('Database column error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Database schema error. Please run database migrations to add missing columns.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  if (err.code === '23505') { // Unique violation
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry. This record already exists.'
    });
  }

  if (err.code === '23503') { // Foreign key constraint violation
    // Check if this is a deletion error (cannot delete because referenced by other records)
    const errorMessage = err.message || '';
    if (errorMessage.includes('violates foreign key constraint') || 
        errorMessage.includes('still referenced') ||
        req.method === 'DELETE') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete this record because it is referenced by other records in the system.'
      });
    }
    // Otherwise, it's an insert/update error (referenced record doesn't exist)
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist.'
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
};















