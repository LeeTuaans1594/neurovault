import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/User.model.js';

/**
 * JWT Authentication Middleware
 * Verifies access token từ Authorization header (Bearer <token>)
 */
const auth = async (req, res, next) => {
  // Skip JWT verification if devAuth already injected user
  if (req.user && req.userId) return next();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await User.findById(decoded.userId).select('-password_hash -refresh_token');
    if (!user) {
      return res.status(401).json({ error: 'User not found. Token invalid.' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    return res.status(500).json({ error: 'Authentication failed.' });
  }
};

export default auth;
