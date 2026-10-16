/**
 * NEUROVAULT — In-Memory Response Cache Middleware
 * Lightweight TTL cache for expensive GET routes (analytics, library, export stats).
 * 
 * Usage:
 *   router.get('/overview', auth, cacheResponse(300), handler);
 * 
 * Features:
 * - Per-user isolation (cache key includes userId)
 * - TTL-based expiration
 * - Auto-cleanup every 5 minutes
 * - Skip on non-200 responses
 * 
 * NOTE: For production at scale, replace with Redis.
 */

/** @type {Map<string, { data: any, expiresAt: number }>} */
const cache = new Map();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}, 5 * 60 * 1000).unref();

/**
 * Cache middleware factory.
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @param {object} options
 * @param {boolean} options.perUser - Include userId in cache key (default: true)
 * @param {string} options.prefix - Cache key prefix
 * @returns {Function} Express middleware
 */
export function cacheResponse(ttlSeconds = 60, options = {}) {
  const { perUser = true, prefix = '' } = options;

  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const userKey = perUser ? (req.userId || 'anon') : 'shared';
    const cacheKey = `${prefix}:${userKey}:${req.originalUrl}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache for a specific user + path pattern.
 * Call when data changes (e.g., after XP award, after publish).
 */
export function invalidateCache(userId, pathPattern) {
  const prefix = userId || '';
  for (const key of cache.keys()) {
    if (key.includes(prefix) && (!pathPattern || key.includes(pathPattern))) {
      cache.delete(key);
    }
  }
}

/**
 * Clear entire cache.
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get cache stats.
 */
export function getCacheStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  for (const [, entry] of cache) {
    if (entry.expiresAt > now) active++;
    else expired++;
  }
  return { total: cache.size, active, expired };
}
