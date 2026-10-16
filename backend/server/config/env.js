import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env từ thư mục chứa file này (backend/server/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * NEUROVAULT — Environment Configuration
 * - Validate biến quan trọng khi startup
 * - Cung cấp fallback hợp lý cho development
 * - Tập trung tất cả config tại một nơi
 */
const config = {
  // ── Server ──
  port: parseInt(process.env.PORT, 10) || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // ── MongoDB ──
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/neurovault',

  // ── JWT ──
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret_CHANGE_IN_PRODUCTION',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_CHANGE_IN_PRODUCTION',
    expire: process.env.JWT_EXPIRE || '15m',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',
  },

  // ── File Upload ──
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 52428800, // 50MB
  },

  // ── AI Core (Python FastAPI) ──
  aiCoreUrl: process.env.AI_CORE_URL || 'http://127.0.0.1:8000',

  // ── Ollama (Local LLM) ──
  ollama: {
    url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    model: process.env.LLM_MODEL || 'qwen3:1.7b',
  },

  // ── Google OAuth 2.0 ──
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5001/api/auth/google/callback',
  },

  // ── Frontend URL ──
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

/**
 * Validate config quan trọng và in cảnh báo khi thiếu
 */
const validateConfig = () => {
  const warnings = [];

  // JWT secrets — PHẢI thay đổi trong production
  if (!config.isDev) {
    if (config.jwt.secret.includes('fallback') || config.jwt.secret.includes('CHANGE')) {
      warnings.push('JWT_SECRET chưa được cấu hình cho production!');
    }
    if (config.jwt.refreshSecret.includes('fallback') || config.jwt.refreshSecret.includes('CHANGE')) {
      warnings.push('JWT_REFRESH_SECRET chưa được cấu hình cho production!');
    }
  }

  // MongoDB URI
  if (config.mongoUri === 'mongodb://127.0.0.1:27017/neurovault') {
    warnings.push('MONGODB_URI đang dùng localhost default — có thể cần Atlas URI.');
  }

  // Google OAuth (optional — chỉ cảnh báo nhẹ)
  if (!config.google.clientId || !config.google.clientSecret) {
    warnings.push('Google OAuth chưa cấu hình — đăng nhập Google sẽ bị tắt.');
  }

  if (warnings.length > 0) {
    console.log('[Config] ⚠️  Cảnh báo cấu hình:');
    warnings.forEach(w => console.log(`  → ${w}`));
  }

  return warnings;
};

/**
 * In tóm tắt cấu hình khi startup (chỉ trong development)
 */
const printConfigSummary = () => {
  if (!config.isDev) return;

  console.log(`[Config] Environment: ${config.nodeEnv}`);
  console.log(`[Config] Port: ${config.port}`);
  console.log(`[Config] MongoDB: ${config.mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`); // Ẩn password
  console.log(`[Config] AI Core: ${config.aiCoreUrl}`);
  console.log(`[Config] Ollama: ${config.ollama.url} (model: ${config.ollama.model})`);
  console.log(`[Config] Client: ${config.clientUrl}`);
  console.log(`[Config] Google OAuth: ${config.google.clientId ? '✅ configured' : '❌ not configured'}`);
};

export default config;
export { validateConfig, printConfigSummary };
