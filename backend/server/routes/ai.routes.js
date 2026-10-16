import { Router } from 'express';
import auth from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import config from '../config/env.js';
import axios from 'axios';

const router = Router();

/**
 * Helper: Proxy request tới AI Core với error handling chuẩn
 * @param {string} method - HTTP method
 * @param {string} path - Đường dẫn API trên AI Core
 * @param {object} data - Body data (cho POST)
 * @param {number} timeoutMs - Timeout tính bằng ms
 * @returns {Promise<object>} Response data từ AI Core
 */
async function proxyToAICore(method, path, data = null, timeoutMs = 30000) {
  const url = `${config.aiCoreUrl}${path}`;
  const options = {
    method,
    url,
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' },
  };

  if (data) {
    options.data = data;
  }

  return axios(options);
}

/**
 * Middleware: Kiểm tra AI Core availability trước khi proxy
 */
const checkAICoreAvailable = async (req, res, next) => {
  try {
    await axios.get(`${config.aiCoreUrl}/health`, { timeout: 3000 });
    next();
  } catch {
    return res.status(503).json({
      error: 'AI Core server is offline.',
      message: 'Ensure the Python AI server is running on port 8000.',
      code: 'AI_CORE_OFFLINE',
      hint: 'cd backend/ai_core && python api/ai_server.py',
    });
  }
};

// ──────────────────────────────────────────────
// Health & Stats
// ──────────────────────────────────────────────

/**
 * GET /api/ai/health
 * Check AI Core + Ollama connection status
 */
router.get('/health', async (req, res) => {
  const result = {
    ai_core: 'offline',
    ollama: 'offline',
    model: config.ollama.model,
  };

  // Check AI Core
  try {
    const response = await axios.get(`${config.aiCoreUrl}/health`, { timeout: 3000 });
    result.ai_core = 'online';
    result.ai_core_details = response.data;
  } catch {
    result.ai_core = 'offline';
  }

  // Check Ollama
  try {
    const response = await axios.get(`${config.ollama.url}/api/tags`, { timeout: 3000 });
    const models = response.data?.models?.map(m => m.name) || [];
    result.ollama = 'online';
    result.ollama_models = models;
    result.gemma4_ready = models.some(m => m.includes('gemma4'));
  } catch {
    result.ollama = 'offline';
  }

  res.json(result);
});

/**
 * GET /api/ai/stats
 * Get AI Core stats for dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    const response = await proxyToAICore('get', '/api/stats');
    res.json(response.data);
  } catch {
    res.json({
      total_documents: 0,
      total_chunks: 0,
      total_concepts: 0,
      llm_available: false,
      llm_model: config.ollama.model,
    });
  }
});

// ──────────────────────────────────────────────
// Chat — RAG-powered với SSE streaming support
// ──────────────────────────────────────────────

/**
 * POST /api/ai/chat
 * RAG-powered chat với document — hỗ trợ cả JSON response và SSE streaming
 * Body: { document_id, query, chat_history?, stream? }
 */
router.post('/chat', auth, aiLimiter, async (req, res, next) => {
  try {
    const { document_id, query, chat_history = [], stream = false } = req.body;

    if (!document_id || !query) {
      return res.status(400).json({
        error: 'document_id and query are required.',
        code: 'MISSING_PARAMS',
      });
    }

    if (query.length > 5000) {
      return res.status(400).json({
        error: 'Query too long. Maximum 5000 characters.',
        code: 'QUERY_TOO_LONG',
      });
    }

    // ── SSE Streaming Mode ──
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Nginx compatibility

      try {
        const streamResponse = await axios.post(
          `${config.aiCoreUrl}/api/chat/stream`,
          { document_id, query, chat_history },
          {
            timeout: 120000, // 2 phút cho streaming
            responseType: 'stream',
          }
        );

        // Pipe SSE stream trực tiếp từ AI Core
        streamResponse.data.on('data', (chunk) => {
          res.write(chunk);
        });

        streamResponse.data.on('end', () => {
          res.write('data: [DONE]\n\n');
          res.end();
        });

        streamResponse.data.on('error', (err) => {
          console.error('[AI Chat Stream] Error:', err.message);
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        });

        // Client disconnect
        req.on('close', () => {
          streamResponse.data.destroy();
        });
      } catch (err) {
        // Fallback: gửi error qua SSE format
        res.write(`data: ${JSON.stringify({ error: 'AI Core streaming failed: ' + err.message })}\n\n`);
        res.end();
      }

      return; // Đã xử lý streaming, không cần tiếp
    }

    // ── JSON Mode (mặc định) ──
    const response = await proxyToAICore('post', '/api/chat', {
      document_id,
      query,
      chat_history,
    }, 60000);

    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'AI Core server is offline.',
        code: 'AI_CORE_OFFLINE',
      });
    }
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

// ──────────────────────────────────────────────
// Quiz Generation
// ──────────────────────────────────────────────

/**
 * POST /api/ai/quiz
 * Generate quiz questions from document
 * Body: { document_id, num_questions?, difficulty?, question_types? }
 */
router.post('/quiz', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const {
      document_id,
      num_questions = 10,
      difficulty = 0.5,
      question_types = ['mcq', 'fill_blank', 'true_false'],
    } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    if (num_questions < 1 || num_questions > 50) {
      return res.status(400).json({ error: 'num_questions must be 1-50.', code: 'INVALID_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/quiz', {
      document_id,
      num_questions: Math.min(Math.max(num_questions, 1), 50),
      difficulty: Math.min(Math.max(difficulty, 0), 1),
      question_types,
    }, 300000); // Increased timeout to 5 minutes

    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

// ──────────────────────────────────────────────
// Flashcard Generation
// ──────────────────────────────────────────────

/**
 * POST /api/ai/flashcards
 * Generate flashcards from document
 * Body: { document_id, max_cards? }
 */
router.post('/flashcards', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id, max_cards = 20 } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/flashcards', {
      document_id,
      max_cards: Math.min(Math.max(max_cards, 1), 100),
    }, 300000); // Increased timeout to 5 minutes

    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

// ──────────────────────────────────────────────
// Knowledge Graph
// ──────────────────────────────────────────────

/**
 * POST /api/ai/knowledge-graph
 * Build knowledge graph for document
 * Body: { document_id }
 */
router.post('/knowledge-graph', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/knowledge-graph', {
      document_id,
      file_path: '',
    }, 300000); // Increased timeout to 5 minutes for Knowledge Graph

    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

// ──────────────────────────────────────────────
// Concepts
// ──────────────────────────────────────────────

/**
 * GET /api/ai/concepts/:documentId
 * Get extracted concepts for document
 */
router.get('/concepts/:documentId', auth, async (req, res, next) => {
  try {
    const response = await proxyToAICore('get', `/api/concepts/${req.params.documentId}`);
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

// ──────────────────────────────────────────────
// Spaced Repetition (FSRS)
// ──────────────────────────────────────────────

/**
 * POST /api/ai/spaced-repetition/review
 * Schedule next review using FSRS algorithm
 * Body: { card_id, rating (1-4), ...card_state }
 */
router.post('/spaced-repetition/review', auth, async (req, res, next) => {
  try {
    const { card_id, rating } = req.body;

    if (!card_id || !rating) {
      return res.status(400).json({ error: 'card_id and rating are required.', code: 'MISSING_PARAMS' });
    }

    if (rating < 1 || rating > 4) {
      return res.status(400).json({ error: 'rating must be 1-4 (Again/Hard/Good/Easy).', code: 'INVALID_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/spaced-repetition/review', req.body);
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

// ──────────────────────────────────────────────
// Summary Generation
// ──────────────────────────────────────────────

/**
 * POST /api/ai/summary
 * Generate summary for document
 * Body: { document_id, max_sentences?, summary_type? }
 */
router.post('/summary', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id, max_sentences = 5, summary_type = 'extractive' } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/summary', {
      document_id,
      max_sentences: Math.min(Math.max(max_sentences, 1), 20),
      summary_type,
    }, 60000);

    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});

// ──────────────────────────────────────────────
// Agent System — Socratic Tutor + Orchestrator
// ──────────────────────────────────────────────

/**
 * POST /api/ai/agent/ask
 * Unified Agent Ask — Orchestrator tự động chọn agent
 * Body: { query, learner_id?, document_id?, conversation_id?, language? }
 */
router.post('/agent/ask', auth, aiLimiter, async (req, res, next) => {
  try {
    const {
      query,
      learner_id = req.user?.id || 'anonymous',
      document_id = '',
      conversation_id = '',
      language = '',
    } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'query is required.',
        code: 'MISSING_PARAMS',
      });
    }

    if (query.length > 5000) {
      return res.status(400).json({
        error: 'Query too long. Maximum 5000 characters.',
        code: 'QUERY_TOO_LONG',
      });
    }

    const response = await proxyToAICore('post', '/api/agent/ask', {
      query,
      learner_id,
      document_id,
      conversation_id,
      language,
    }, 90000); // 90s timeout — orchestrator cần suy nghĩ lâu hơn

    res.json(response.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'AI Core server is offline.',
        code: 'AI_CORE_OFFLINE',
        hint: 'cd backend/ai_core && python api/ai_server.py',
      });
    }
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    next(err);
  }
});


/**
 * POST /api/ai/agent/ask/stream
 * Unified Agent Ask — SSE streaming mode
 * Body: { query, learner_id?, document_id?, conversation_id?, language? }
 */
router.post('/agent/ask/stream', auth, aiLimiter, async (req, res) => {
  const {
    query,
    learner_id = req.user?.id || 'anonymous',
    document_id = '',
    conversation_id = '',
    language = '',
  } = req.body;

  if (!query) {
    return res.status(400).json({
      error: 'query is required.',
      code: 'MISSING_PARAMS',
    });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const streamResponse = await axios.post(
      `${config.aiCoreUrl}/api/agent/ask/stream`,
      { query, learner_id, document_id, conversation_id, language },
      {
        timeout: 120000,
        responseType: 'stream',
      }
    );

    // Pipe SSE stream từ AI Core
    streamResponse.data.on('data', (chunk) => {
      res.write(chunk);
    });

    streamResponse.data.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    streamResponse.data.on('error', (err) => {
      console.error('[Agent Ask Stream] Error:', err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    });

    req.on('close', () => {
      streamResponse.data.destroy();
    });
  } catch (err) {
    const errorMsg = err.code === 'ECONNREFUSED'
      ? 'AI Core server is offline. Start the Python server first.'
      : `Agent streaming failed: ${err.message}`;
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
    res.end();
  }
});


/**
 * GET /api/ai/agent/status
 * Trạng thái Agent system — registry, agents, metrics
 */
router.get('/agent/status', async (req, res) => {
  try {
    const response = await proxyToAICore('get', '/api/agent/status', null, 5000);
    res.json(response.data);
  } catch {
    res.json({
      status: 'offline',
      message: 'Agent system is not available. AI Core may be offline.',
      registry: { total_agents: 0, available: 0 },
    });
  }
});

// ──────────────────────────────────────────────
// Phase 2: Adaptive Quiz
// ──────────────────────────────────────────────

/**
 * POST /api/ai/adaptive-quiz/start
 * Start an adaptive IRT quiz session
 */
router.post('/adaptive-quiz/start', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id, learner_id = 'default', max_questions = 15 } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/adaptive-quiz/start', {
      document_id,
      learner_id,
      max_questions: Math.min(Math.max(max_questions, 3), 50),
    }, 300000); // Increased timeout to 5 minutes

    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

/**
 * POST /api/ai/adaptive-quiz/answer
 * Submit answer to adaptive quiz
 */
router.post('/adaptive-quiz/answer', auth, async (req, res, next) => {
  try {
    const { session_id, answer } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/adaptive-quiz/answer', req.body, 30000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

/**
 * GET /api/ai/adaptive-quiz/status/:sessionId
 * Get adaptive quiz session status
 */
router.get('/adaptive-quiz/status/:sessionId', auth, async (req, res, next) => {
  try {
    const response = await proxyToAICore('get', `/api/adaptive-quiz/status/${req.params.sessionId}`);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

// ──────────────────────────────────────────────
// Phase 2: Smart Flashcard Scheduler
// ──────────────────────────────────────────────

/**
 * POST /api/ai/flashcards/due
 * Get due flashcards with priority ordering
 */
router.post('/flashcards/due', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/flashcards/due', req.body, 300000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

/**
 * POST /api/ai/flashcards/review
 * Process flashcard review with FSRS
 */
router.post('/flashcards/review', auth, async (req, res, next) => {
  try {
    const { document_id, card_id, rating } = req.body;

    if (!document_id || !card_id || !rating) {
      return res.status(400).json({ error: 'document_id, card_id, and rating are required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/flashcards/review', req.body, 30000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

/**
 * GET /api/ai/flashcards/stats/:documentId
 * Get flashcard deck statistics
 */
router.get('/flashcards/stats/:documentId', auth, async (req, res, next) => {
  try {
    const response = await proxyToAICore('get', `/api/flashcards/stats/${req.params.documentId}`);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

// ──────────────────────────────────────────────
// Phase 5: Cross-Document Knowledge
// ──────────────────────────────────────────────

/**
 * POST /api/ai/cross-document/merge
 * Merge knowledge graphs from multiple documents
 */
router.post('/cross-document/merge', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_ids } = req.body;

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length < 2) {
      return res.status(400).json({ error: 'document_ids must be an array with at least 2 IDs.', code: 'INVALID_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/cross-document/merge', req.body, 120000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

/**
 * POST /api/ai/cross-document/related
 * Find related documents by concept overlap
 */
router.post('/cross-document/related', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/cross-document/related', req.body, 60000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

// ──────────────────────────────────────────────
// Phase 5: Smart Notifications
// ──────────────────────────────────────────────

/**
 * POST /api/ai/smart-notifications/check
 * Check learner state and generate contextual notifications
 */
router.post('/smart-notifications/check', auth, async (req, res, next) => {
  try {
    const response = await proxyToAICore('post', '/api/smart-notifications/check', req.body, 15000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

// ──────────────────────────────────────────────
// Phase 5: Learning Path
// ──────────────────────────────────────────────

/**
 * POST /api/ai/learning-path/next
 * Get recommended next concepts to study
 */
router.post('/learning-path/next', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/learning-path/next', req.body, 300000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

/**
 * POST /api/ai/study-plan
 * Generate daily study plan
 */
router.post('/study-plan', auth, checkAICoreAvailable, async (req, res, next) => {
  try {
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required.', code: 'MISSING_PARAMS' });
    }

    const response = await proxyToAICore('post', '/api/study-plan', req.body, 300000);
    res.json(response.data);
  } catch (err) {
    if (err.response) return res.status(err.response.status).json(err.response.data);
    next(err);
  }
});

export default router;

