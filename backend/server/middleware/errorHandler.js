/**
 * NEUROVAULT — Global Error Handler Middleware
 * Xử lý tập trung tất cả errors, format response chuẩn JSON
 * Phân loại: Mongoose, Multer, JWT, Axios/Fetch proxy, và server errors
 */
const errorHandler = (err, req, res, _next) => {
  // Log error chi tiết (chỉ server-side, không gửi cho client)
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (process.env.NODE_ENV === 'development' && err.stack) {
    console.error('  Stack:', err.stack.split('\n').slice(0, 5).join('\n  '));
  }

  // ── Mongoose Validation Error ──
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      error: 'Validation failed',
      details: errors,
      code: 'VALIDATION_ERROR',
    });
  }

  // ── Mongoose Duplicate Key ──
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      error: `${field} already exists.`,
      code: 'DUPLICATE_KEY',
    });
  }

  // ── Mongoose Cast Error (invalid ObjectId) ──
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid ${err.path}: ${err.value}`,
      code: 'INVALID_ID',
    });
  }

  // ── Mongoose Disconnect (DB down) ──
  if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoServerSelectionError') {
    return res.status(503).json({
      error: 'Database temporarily unavailable. Please try again later.',
      code: 'DB_UNAVAILABLE',
    });
  }

  // ── Multer File Size Error ──
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large. Maximum size is 50MB.',
      code: 'FILE_TOO_LARGE',
    });
  }

  // ── Multer File Type Error ──
  if (err.message && err.message.includes('File type not allowed')) {
    return res.status(415).json({
      error: err.message,
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  }

  // ── JWT Errors ──
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired.',
      code: 'TOKEN_EXPIRED',
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token.',
      code: 'INVALID_TOKEN',
    });
  }

  // ── Axios/Fetch proxy errors (AI Core offline) ──
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      error: 'AI Core server is offline.',
      message: 'Ensure the Python AI server is running on port 8000.',
      code: 'AI_CORE_OFFLINE',
    });
  }

  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.name === 'AbortError') {
    return res.status(504).json({
      error: 'AI Core request timed out.',
      code: 'AI_CORE_TIMEOUT',
    });
  }

  // ── Syntax Error (invalid JSON body) ──
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON in request body.',
      code: 'INVALID_JSON',
    });
  }

  // ── Default Server Error ──
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
    code: 'SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { debug: err.message }),
  });
};

export default errorHandler;
