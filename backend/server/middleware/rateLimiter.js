import rateLimit from 'express-rate-limit';
import config from '../config/env.js';

/**
 * Rate Limiter Middleware
 * Development mode: limits nới lỏng để dễ test
 * Production mode: limits chặt chẽ để chống abuse
 */

// General API rate limit
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 1000 : 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: config.isDev ? (req) => req.path === '/health' : undefined,
});

// Auth rate limit: anti brute-force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 200 : 20,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI inference rate limit
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.isDev ? 300 : 30,
  message: { error: 'AI request rate limit exceeded. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

