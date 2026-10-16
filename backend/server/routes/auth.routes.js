import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { register, login, refreshToken, getMe, logout, updateProfile, changePassword } from '../controllers/auth.controller.js';
import auth from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { auditMiddleware } from '../middleware/security.js';
import config from '../config/env.js';

const router = Router();

// ── Local Auth (with audit logging for sensitive ops) ──
router.post('/register', authLimiter, auditMiddleware('AUTH_REGISTER'), register);
router.post('/login', authLimiter, auditMiddleware('AUTH_LOGIN'), login);
router.post('/refresh', refreshToken);
router.get('/me', auth, getMe);
router.put('/profile', auth, updateProfile);
router.put('/password', auth, auditMiddleware('AUTH_PASSWORD_CHANGE'), changePassword);
router.post('/logout', auth, auditMiddleware('AUTH_LOGOUT'), logout);

// ── Google OAuth ──

/**
 * Tạo JWT tokens cho Google OAuth user
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expire });
  const refreshToken = jwt.sign({ userId }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpire });
  return { accessToken, refreshToken };
};

/**
 * GET /api/auth/google
 * Redirect user to Google consent screen
 */
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${config.clientUrl}/login?error=google_auth_failed`,
  }),
  async (req, res) => {
    try {
      const user = req.user;
      const { accessToken, refreshToken } = generateTokens(user._id);

      // Save refresh token
      user.refresh_token = refreshToken;
      await user.save();

      // Redirect to frontend with tokens in URL params
      const redirectUrl = new URL(`${config.clientUrl}/auth/google/callback`);
      redirectUrl.searchParams.set('accessToken', accessToken);
      redirectUrl.searchParams.set('refreshToken', refreshToken);

      res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error('[Google Auth] Callback error:', err);
      res.redirect(`${config.clientUrl}/login?error=auth_failed`);
    }
  }
);

export default router;
