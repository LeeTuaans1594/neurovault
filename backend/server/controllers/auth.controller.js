import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import config from '../config/env.js';

/**
 * Tạo access + refresh token pair
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expire });
  const refreshToken = jwt.sign({ userId }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpire });
  return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check duplicate
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Create user (password_hash field — pre-save hook sẽ hash)
    const user = new User({
      email,
      password_hash: password,
      name,
      avatar: name.charAt(0).toUpperCase(),
    });

    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token
    user.refresh_token = refreshToken;
    await user.save();

    res.status(201).json({
      message: 'Registration successful',
      user: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find user (include password_hash for comparison)
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (!user.password_hash || user.auth_provider === 'google' || user.google_id) {
        return res.status(401).json({ error: 'This account was created with Google. Please use Google Sign-In.' });
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token
    user.refresh_token = refreshToken;
    await user.save();

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.refreshSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    // Find user and verify stored token matches
    const user = await User.findById(decoded.userId);
    if (!user || user.refresh_token !== token) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    // Generate new token pair
    const newTokens = generateTokens(user._id);

    // Update stored refresh token (rotation)
    user.refresh_token = newTokens.refreshToken;
    await user.save();

    res.json({
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Requires: auth middleware
 */
export const getMe = async (req, res) => {
  res.json({ user: req.user });
};

/**
 * POST /api/auth/logout
 */
export const logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (user) {
      user.refresh_token = null;
      await user.save();
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/profile
 * Update user profile (name, email)
 * Requires: auth middleware
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check email uniqueness if changing
    if (email && email.toLowerCase() !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(409).json({ error: 'Email already in use.' });
      }
      user.email = email.toLowerCase();
    }

    if (name) user.name = name.trim();

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/password
 * Change password
 * Requires: auth middleware
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Update password (pre-save hook will hash)
    user.password_hash = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};
