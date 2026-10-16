/**
 * NEUROVAULT — Security Middleware
 * Centralized security hardening:
 * - MongoDB injection protection (sanitize req.body/query/params)
 * - XSS input sanitization (strip dangerous HTML)
 * - File upload magic bytes validation
 * - Audit logging for sensitive operations
 */
import mongoSanitize from 'mongo-sanitize';
import fs from 'fs';

// ══════════════════════════════════════════════
// 1. MongoDB Injection Protection
// ══════════════════════════════════════════════

/**
 * Sanitize req.body, req.query, req.params to prevent $gt, $ne, $where injection.
 */
export function sanitizeInput(req, _res, next) {
  if (req.body) req.body = mongoSanitize(req.body);
  if (req.query) req.query = mongoSanitize(req.query);
  if (req.params) req.params = mongoSanitize(req.params);
  next();
}

// ══════════════════════════════════════════════
// 2. XSS Sanitization for user-generated text
// ══════════════════════════════════════════════

/**
 * Strip dangerous HTML/JS from string values in req.body (recursive).
 * Preserves markdown formatting but removes script tags and event handlers.
 */
export function sanitizeXSS(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  next();
}

function deepSanitize(obj) {
  if (typeof obj === 'string') {
    return stripDangerousHTML(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSanitize);
  }
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      clean[key] = deepSanitize(value);
    }
    return clean;
  }
  return obj;
}

function stripDangerousHTML(str) {
  return str
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers (onclick, onerror, onload, etc.)
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: URLs
    .replace(/javascript\s*:/gi, '')
    // Remove data: URLs with script content
    .replace(/data\s*:\s*text\/html/gi, '')
    // Remove style expressions (IE)
    .replace(/expression\s*\(/gi, '')
    // Remove vbscript
    .replace(/vbscript\s*:/gi, '');
}

// ══════════════════════════════════════════════
// 3. File Upload Magic Bytes Validation
// ══════════════════════════════════════════════

// Magic byte signatures for allowed file types
const MAGIC_BYTES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from('RIFF'), Buffer.from('WEBP')], // RIFF at 0, WEBP at 8
  'image/bmp': [Buffer.from([0x42, 0x4D])],
  'image/tiff': [Buffer.from([0x49, 0x49, 0x2A, 0x00]), Buffer.from([0x4D, 0x4D, 0x00, 0x2A])],
  'application/pdf': [Buffer.from('%PDF')],
};

/**
 * Validate uploaded file's magic bytes match claimed MIME type.
 * Must be used AFTER multer middleware (req.file must exist).
 */
export function validateFileMagicBytes(req, res, next) {
  if (!req.file) return next();

  const { mimetype, path: filePath } = req.file;

  // Only validate types we have signatures for
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return next(); // txt/md/docx — skip magic check

  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    let valid = false;

    if (mimetype === 'image/webp') {
      // WEBP: RIFF at offset 0, WEBP at offset 8
      valid = buffer.subarray(0, 4).equals(Buffer.from('RIFF')) &&
              buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
    } else {
      // Standard magic byte check
      valid = signatures.some(sig => {
        const slice = buffer.subarray(0, sig.length);
        return slice.equals(sig);
      });
    }

    if (!valid) {
      // Clean up the uploaded file
      try { fs.unlinkSync(filePath); } catch { /* */ }
      return res.status(415).json({
        error: 'File content does not match declared type. Possible file extension spoofing.',
        code: 'MAGIC_BYTES_MISMATCH',
      });
    }
  } catch {
    // If we can't read the file, let it pass (multer already validated)
  }

  next();
}

// ══════════════════════════════════════════════
// 4. Audit Logger for sensitive operations
// ══════════════════════════════════════════════

const auditLog = [];
const MAX_AUDIT_LOG = 1000;

/**
 * Log a security-relevant event.
 */
export function logAuditEvent(userId, action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    userId: userId?.toString() || 'anonymous',
    action,
    ip: details.ip || 'unknown',
    userAgent: details.userAgent || '',
    ...details,
  };

  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_LOG) auditLog.shift();

  // Console log in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[AUDIT] ${entry.action} by ${entry.userId} from ${entry.ip}`);
  }
}

/**
 * Get recent audit log entries.
 */
export function getAuditLog(limit = 50) {
  return auditLog.slice(-limit).reverse();
}

/**
 * Express middleware to auto-log auth events.
 */
export function auditMiddleware(action) {
  return (req, _res, next) => {
    logAuditEvent(req.userId || req.body?.email, action, {
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']?.slice(0, 200),
      path: req.path,
      method: req.method,
    });
    next();
  };
}
