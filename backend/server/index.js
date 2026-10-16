import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import hpp from 'hpp';
import passport from 'passport';
import connectDB, { disconnectDB, getDBStatus } from './config/db.js';
import config, { validateConfig, printConfigSummary } from './config/env.js';
import setupGoogleAuth from './config/passport.js';
import { generalLimiter, aiLimiter } from './middleware/rateLimiter.js';
import { sanitizeInput, sanitizeXSS } from './middleware/security.js';
import errorHandler from './middleware/errorHandler.js';
import devAuth from './middleware/devAuth.js';
import { setupCollaborationWS, getCollabStats } from './collaboration.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import documentRoutes from './routes/document.routes.js';
import aiRoutes from './routes/ai.routes.js';
import learningRoutes from './routes/learning.routes.js';
import annotationRoutes from './routes/annotation.routes.js';
import gamificationRoutes from './routes/gamification.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import collabRoutes from './routes/collab.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import libraryRoutes from './routes/library.routes.js';
import ocrRoutes from './routes/ocr.routes.js';
import exportRoutes from './routes/export.routes.js';
import instructorRoutes from './routes/instructor.routes.js';
import monitorRoutes from './routes/monitor.routes.js';
import { metricsMiddleware } from './services/metrics.service.js';

const app = express();

// ──────────────────────────────────────────────
// Request Logger — ghi log mỗi request đến
// ──────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();

  // Log khi response hoàn tất
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '🔴' : res.statusCode >= 300 ? '🟡' : '🟢';

    // Chỉ log trong development, bỏ qua health check để tránh spam
    if (config.isDev && !req.path.includes('/health')) {
      console.log(
        `${statusColor} ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
});

// ──────────────────────────────────────────────
// Metrics Collection — track all requests
// ──────────────────────────────────────────────
app.use(metricsMiddleware);

// ──────────────────────────────────────────────
// Security
// ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: config.isDev ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
      connectSrc: ["'self'", config.aiCoreUrl, config.ollama.url, 'ws://localhost:*', 'wss://localhost:*'],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  // Prevent MIME-type sniffing
  noSniff: true,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Hide X-Powered-By
  hidePoweredBy: true,
}));

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    config.clientUrl,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Dev-Bypass'],
  exposedHeaders: ['X-Request-Id'],
}));

// ──────────────────────────────────────────────
// Body Parsing
// ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ──────────────────────────────────────────────
// Security: Input Sanitization
// ──────────────────────────────────────────────
app.use(sanitizeInput);  // MongoDB injection protection ($gt, $ne, $where)
app.use(sanitizeXSS);    // Strip dangerous HTML/JS from req.body
app.use(hpp());           // HTTP Parameter Pollution protection

// ──────────────────────────────────────────────
// Response Compression (gzip/brotli)
// ──────────────────────────────────────────────
app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Skip compression for SSE streams
    if (req.headers.accept === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// ──────────────────────────────────────────────
// Passport (Google OAuth)
// ──────────────────────────────────────────────
app.use(passport.initialize());
setupGoogleAuth();

// ──────────────────────────────────────────────
// Rate Limiting
// ──────────────────────────────────────────────
app.use('/api/', generalLimiter);

// ──────────────────────────────────────────────
// Health Check — Kiểm tra chi tiết trạng thái hệ thống
// ──────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const dbStatus = getDBStatus();

  // Kiểm tra AI Core
  let aiCoreStatus = { status: 'unknown' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const aiResponse = await fetch(`${config.aiCoreUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (aiResponse.ok) {
      aiCoreStatus = { status: 'online', ...(await aiResponse.json()) };
    } else {
      aiCoreStatus = { status: 'error', code: aiResponse.status };
    }
  } catch {
    aiCoreStatus = { status: 'offline' };
  }

  // Kiểm tra Ollama
  let ollamaStatus = { status: 'unknown' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const ollamaResponse = await fetch(`${config.ollama.url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (ollamaResponse.ok) {
      const data = await ollamaResponse.json();
      const models = data.models?.map(m => m.name) || [];
      const hasGemma = models.some(m => m.includes('gemma4'));
      ollamaStatus = {
        status: 'online',
        models_count: models.length,
        gemma4_available: hasGemma,
        model_target: config.ollama.model,
      };
    } else {
      ollamaStatus = { status: 'error', code: ollamaResponse.status };
    }
  } catch {
    ollamaStatus = { status: 'offline' };
  }

  // Tổng hợp trạng thái
  const allHealthy = dbStatus.connected &&
    aiCoreStatus.status === 'online' &&
    ollamaStatus.status === 'online';

  const statusCode = 200; // Always return 200 to allow frontend to parse the degraded status without network errors

  res.status(statusCode).json({
    status: allHealthy ? 'healthy' : 'degraded',
    service: 'NEUROVAULT API Gateway v2.1',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: config.nodeEnv,
    components: {
      database: {
        status: dbStatus.connected ? 'connected' : 'disconnected',
        host: dbStatus.host,
        db_name: dbStatus.name,
      },
      ai_core: aiCoreStatus,
      ollama: ollamaStatus,
    },
    features: [
      'auth', 'google-oauth', 'documents', 'ai-chat',
      'quiz', 'flashcards', 'knowledge-graph', 'spaced-repetition',
      'gamification',
    ],
  });
});

// ──────────────────────────────────────────────
// Dev Auth Bypass (development only)
// ──────────────────────────────────────────────
app.use('/api/', devAuth);

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/annotations', annotationRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/collab', collabRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/monitor', monitorRoutes);

// ──────────────────────────────────────────────
// 404 Handler
// ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.path,
    hint: 'Xem /api/health để kiểm tra trạng thái server.',
  });
});

// ──────────────────────────────────────────────
// Global Error Handler
// ──────────────────────────────────────────────
app.use(errorHandler);

// ──────────────────────────────────────────────
// Server Startup
// ──────────────────────────────────────────────
const startServer = async () => {
  // In config summary (chỉ development)
  printConfigSummary();

  // Validate config
  validateConfig();

  // Kết nối MongoDB (KHÔNG crash nếu thất bại)
  const dbConn = await connectDB();

  // Khởi động Express server BẤT KỂ MongoDB status
  let currentPort = config.port;

  const startListening = (port) => {
    const server_instance = app.listen(port);

    server_instance.on('listening', () => {
      currentPort = port;
      const dbIcon = dbConn ? '✅' : '⚠️';
      const dbText = dbConn ? 'Connected' : 'Disconnected (server vẫn chạy)';

      // Attach WebSocket collaboration server
      setupCollaborationWS(server_instance);

      console.log(`
╔═══════════════════════════════════════════════════╗
║          NEUROVAULT API Gateway v2.1              ║
║          Port: ${String(port).padEnd(36)}║
║          Env:  ${config.nodeEnv.padEnd(36)}║
║          DB:   ${dbIcon} ${dbText.padEnd(33)}║
║                                                   ║
║  Routes:                                          ║
║    /api/health      — System health check         ║
║    /api/auth        — Auth + Google OAuth          ║
║    /api/documents   — Document CRUD + Upload       ║
║    /api/ai          — Chat, Quiz, Flashcards       ║
╚═══════════════════════════════════════════════════╝
      `);
    });

    server_instance.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Server] ⚠️ Port ${port} đang bị chiếm. Thử port ${port + 1}...`);
        server_instance.close();
        if (port < config.port + 5) {
          startListening(port + 1);
        } else {
          console.error(`[Server] ❌ Không tìm được port trống (${config.port}-${port}). Thoát.`);
          process.exit(1);
        }
      } else {
        console.error('[Server] ❌ Server error:', err.message);
        process.exit(1);
      }
    });

    return server_instance;
  };

  const server = startListening(config.port);

  // ── Graceful Shutdown ──
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Server] 🛑 ${signal} received — đang tắt server...`);

    // Ngừng nhận request mới
    server.close(async () => {
      console.log('[Server] HTTP server đã đóng.');

      // Terminate OCR workers
      try {
        const { terminateOCR } = await import('./services/ocr.service.js');
        await terminateOCR();
      } catch { /* OCR may not have been initialized */ }

      // Ngắt MongoDB
      await disconnectDB();

      console.log('[Server] ✅ Graceful shutdown hoàn tất.');
      process.exit(0);
    });

    // Force close sau 10 giây nếu không shutdown được
    setTimeout(() => {
      console.error('[Server] ⛔ Force shutdown sau 10s timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Xử lý uncaught exceptions/rejections
  process.on('uncaughtException', (err) => {
    console.error('[Server] ⛔ Uncaught Exception:', err.message);
    console.error(err.stack);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] ⛔ Unhandled Rejection:', reason);
  });
};

startServer().catch((err) => {
  console.error('[Server] ❌ Fatal startup error:', err);
  process.exit(1);
});

export default app;
