/**
 * NEUROVAULT — Role Authorization Middleware
 * Check if authenticated user has required role(s).
 * Must be used AFTER auth middleware.
 *
 * Usage:
 *   router.get('/admin-only', auth, requireRole('admin'), handler);
 *   router.get('/instructor', auth, requireRole('instructor', 'admin'), handler);
 */

/**
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userRole = req.user.role || 'user';
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        code: 'FORBIDDEN',
        required: roles,
        current: userRole,
      });
    }

    next();
  };
}

/**
 * Check if user is instructor or admin.
 */
export const requireInstructor = requireRole('instructor', 'admin');

/**
 * Check if user is admin.
 */
export const requireAdmin = requireRole('admin');
