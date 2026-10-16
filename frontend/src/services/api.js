/**
 * NEUROVAULT — API Service Layer
 * Centralized HTTP client cho tất cả API calls.
 * Handles JWT auth, token refresh, error mapping.
 */

const API_BASE = '/api';

// ──── Dev Auth Bypass (must match App.jsx DEV_BYPASS_AUTH) ────
const DEV_BYPASS_AUTH = import.meta.env.DEV;

// ──── Token Management ────
let accessToken = localStorage.getItem('neurovault_access_token');
let refreshTokenValue = localStorage.getItem('neurovault_refresh_token');

export const setTokens = (access, refresh) => {
  accessToken = access;
  refreshTokenValue = refresh;
  if (access) localStorage.setItem('neurovault_access_token', access);
  else localStorage.removeItem('neurovault_access_token');
  if (refresh) localStorage.setItem('neurovault_refresh_token', refresh);
  else localStorage.removeItem('neurovault_refresh_token');
};

export const clearTokens = () => {
  accessToken = null;
  refreshTokenValue = null;
  localStorage.removeItem('neurovault_access_token');
  localStorage.removeItem('neurovault_refresh_token');
};

export const getAccessToken = () => accessToken;

/**
 * Build auth headers for direct fetch calls (outside fetchAPI).
 * Includes dev bypass header when DEV_BYPASS_AUTH is active.
 */
export function _buildAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (DEV_BYPASS_AUTH) {
    headers['X-Dev-Bypass'] = 'true';
  } else if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}

// ──── Core Fetch Wrapper ────

async function fetchAPI(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    ...options.headers,
  };

  // Don't set Content-Type for FormData (browser sets boundary automatically)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach auth token OR dev bypass header
  if (DEV_BYPASS_AUTH) {
    headers['X-Dev-Bypass'] = 'true';
  } else if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(url, { ...options, headers });

  // Auto-refresh token on 401
  if (response.status === 401 && refreshTokenValue) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      response = await fetch(url, { ...options, headers });
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  return response.json();
}

async function attemptTokenRefresh() {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });

    if (response.ok) {
      const data = await response.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    }
  } catch {
    // Refresh failed
  }
  clearTokens();
  return false;
}

// ──── Auth API ────

export const authAPI = {
  register: (name, email, password) =>
    fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email, password) =>
    fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () =>
    fetchAPI('/auth/me'),

  updateProfile: (updates) =>
    fetchAPI('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  changePassword: (currentPassword, newPassword) =>
    fetchAPI('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  logout: () =>
    fetchAPI('/auth/logout', { method: 'POST' }),
};

// ──── Documents API ────

export const documentsAPI = {
  upload: (file, title) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    return fetchAPI('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  list: (page = 1, limit = 20) =>
    fetchAPI(`/documents?page=${page}&limit=${limit}`),

  get: (id) =>
    fetchAPI(`/documents/${id}`),

  getStatus: (id) =>
    fetchAPI(`/documents/${id}/status`),

  delete: (id) =>
    fetchAPI(`/documents/${id}`, { method: 'DELETE' }),

  /**
   * Lấy URL để embed file gốc (PDF, TXT) trong viewer
   * Trả về blob URL — gọi URL.revokeObjectURL() khi unmount
   */
  getFileBlob: async (id) => {
    const url = `${API_BASE}/documents/${id}/file`;
    const headers = _buildAuthHeaders();
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to load file: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return {
      blobUrl: URL.createObjectURL(blob),
      mimeType: response.headers.get('Content-Type') || 'application/octet-stream',
    };
  },
};

// ──── Annotations API ────

export const annotationsAPI = {
  /**
   * Lấy tất cả annotations cho 1 document
   */
  list: (documentId) =>
    fetchAPI(`/annotations/${documentId}`),

  /**
   * Tạo annotation mới
   * @param {object} data - { document_id, type, text_selection?, chunk_index?, content?, color? }
   */
  create: (data) =>
    fetchAPI('/annotations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Cập nhật annotation
   * @param {string} id - Annotation ID
   * @param {object} updates - { content?, color?, is_pinned? }
   */
  update: (id, updates) =>
    fetchAPI(`/annotations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  /**
   * Xóa annotation
   */
  delete: (id) =>
    fetchAPI(`/annotations/${id}`, { method: 'DELETE' }),
};

// ──── AI API ────

export const aiAPI = {
  /**
   * RAG-powered chat with document
   */
  chat: (documentId, query, chatHistory = []) =>
    fetchAPI('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        query,
        chat_history: chatHistory,
      }),
    }),

  /**
   * Generate quiz from document
   */
  generateQuiz: (documentId, numQuestions = 10, difficulty = 0.5, questionTypes = ['mcq', 'fill_blank', 'true_false']) =>
    fetchAPI('/ai/quiz', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        num_questions: numQuestions,
        difficulty,
        question_types: questionTypes,
      }),
    }),

  /**
   * Generate flashcards from document
   */
  generateFlashcards: (documentId, maxCards = 20) =>
    fetchAPI('/ai/flashcards', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        max_cards: maxCards,
      }),
    }),

  /**
   * Build knowledge graph from document
   */
  getKnowledgeGraph: (documentId) =>
    fetchAPI('/ai/knowledge-graph', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId }),
    }),

  /**
   * Get extracted concepts from document
   */
  getConcepts: (documentId) =>
    fetchAPI(`/ai/concepts/${documentId}`),

  /**
   * Schedule spaced repetition review
   */
  scheduleReview: (rating, stability, difficulty, elapsedDays, reviewCount) =>
    fetchAPI('/ai/spaced-repetition/review', {
      method: 'POST',
      body: JSON.stringify({
        rating,
        stability,
        difficulty,
        elapsed_days: elapsedDays,
        review_count: reviewCount,
      }),
    }),

  // ── Adaptive Quiz (Phase 2) ──

  /** Start an adaptive quiz session */
  startAdaptiveQuiz: (documentId, learnerId = 'default', maxQuestions = 15) =>
    fetchAPI('/ai/adaptive-quiz/start', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        learner_id: learnerId,
        max_questions: maxQuestions,
      }),
    }),

  /** Submit answer to adaptive quiz */
  submitAdaptiveAnswer: (sessionId, answer, responseTimeMs = null) =>
    fetchAPI('/ai/adaptive-quiz/answer', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        answer,
        response_time_ms: responseTimeMs,
      }),
    }),

  /** Get adaptive quiz session status */
  getAdaptiveQuizStatus: (sessionId) =>
    fetchAPI(`/ai/adaptive-quiz/status/${sessionId}`),

  // ── Smart Flashcard Scheduler (Phase 2) ──

  /** Get due flashcards with priority ordering */
  getDueFlashcards: (documentId, maxNew = 10, maxReview = 50) =>
    fetchAPI('/ai/flashcards/due', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        max_new: maxNew,
        max_review: maxReview,
      }),
    }),

  /** Process flashcard review with FSRS */
  reviewFlashcard: (documentId, cardId, rating) =>
    fetchAPI('/ai/flashcards/review', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        card_id: cardId,
        rating,
      }),
    }),

  /** Get flashcard deck stats */
  getFlashcardStats: (documentId) =>
    fetchAPI(`/ai/flashcards/stats/${documentId}`),

  /**
   * Generate summary from document
   * @param {string} documentId - Document ID
   * @param {number} maxSentences - Số câu tối đa (1-20)
   * @param {string} summaryType - 'extractive' hoặc 'abstractive'
   */
  generateSummary: (documentId, maxSentences = 5, summaryType = 'extractive') =>
    fetchAPI('/ai/summary', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        max_sentences: maxSentences,
        summary_type: summaryType,
      }),
    }),

  /**
   * Get AI Core stats for dashboard
   */
  getStats: async () => {
    try {
      return await fetchAPI('/ai/stats');
    } catch {
      return {
        total_documents: 0,
        total_chunks: 0,
        total_concepts: 0,
        llm_available: false,
      };
    }
  },

  // ── Phase 5: Cross-Document Knowledge ──

  /** Merge knowledge graphs from multiple documents */
  mergeDocumentGraphs: (documentIds) =>
    fetchAPI('/ai/cross-document/merge', {
      method: 'POST',
      body: JSON.stringify({ document_ids: documentIds }),
    }),

  /** Find documents related by concept overlap */
  findRelatedDocuments: (documentId) =>
    fetchAPI('/ai/cross-document/related', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId }),
    }),

  // ── Phase 5: Smart Notifications ──

  /** Check for smart learning notifications */
  checkSmartNotifications: (learnerState) =>
    fetchAPI('/ai/smart-notifications/check', {
      method: 'POST',
      body: JSON.stringify(learnerState),
    }),

  // ── Phase 5: Learning Path ──

  /** Get recommended next concepts to study */
  getNextConcepts: (documentId, learnerId = 'default', topN = 5) =>
    fetchAPI('/ai/learning-path/next', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        learner_id: learnerId,
        top_n: topN,
      }),
    }),

  /** Generate daily study plan */
  getStudyPlan: (documentId, learnerId = 'default', days = 7) =>
    fetchAPI('/ai/study-plan', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        learner_id: learnerId,
        days,
      }),
    }),
};

// ──── Learning API ────

export const learningAPI = {
  /**
   * Lấy toàn bộ dashboard stats: streak, heatmap, weekly, mastery
   */
  getDashboardStats: async () => {
    try {
      return await fetchAPI('/learning/dashboard-stats');
    } catch {
      return null;
    }
  },

  /**
   * Ghi nhận hoạt động học tập mới
   * @param {string} type - quiz|flashcard|chat|reading
   * @param {string} documentId - ID tài liệu
   * @param {number} durationSeconds - Thời gian (giây)
   * @param {object} results - Kết quả chi tiết
   */
  recordActivity: (type, documentId, durationSeconds, results = {}) =>
    fetchAPI('/learning/record-activity', {
      method: 'POST',
      body: JSON.stringify({
        type,
        documentId,
        durationSeconds,
        results,
      }),
    }),

  /**
   * Lấy thống kê chi tiết cho Profile v2
   */
  getProfileStats: async () => {
    try {
      return await fetchAPI('/learning/profile-stats');
    } catch {
      return null;
    }
  },

  /**
   * Export toàn bộ dữ liệu học tập (download JSON)
   */
  exportData: async () => {
    const url = `${API_BASE}/learning/export-data`;
    const headers = _buildAuthHeaders();
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    // Trigger download
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `neurovault-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    return true;
  },
};

// ──── Health Check API ────

export const healthAPI = {
  /**
   * Check API Gateway health
   */
  checkGateway: async () => {
    try {
      const resp = await fetch(`${API_BASE}/health`);
      return resp.ok ? await resp.json() : null;
    } catch {
      return null;
    }
  },

  /**
   * Check AI Core health (via gateway proxy)
   */
  checkAICore: async () => {
    try {
      const resp = await fetch(`${API_BASE}/ai/health`);
      return resp.ok ? await resp.json() : null;
    } catch {
      return null;
    }
  },
};
// ──── Gamification API ────

export const gamificationAPI = {
  /**
   * Lấy gamification profile: XP, level, badges, daily challenge
   */
  getProfile: async () => {
    try {
      return await fetchAPI('/gamification/profile');
    } catch {
      return null;
    }
  },

  /**
   * Award XP cho action
   * @param {string} action - upload_document, complete_quiz, review_flashcard, chat_message
   * @param {object} metadata - { scorePercent?, cardsReviewed?, durationMinutes? }
   */
  awardXP: (action, metadata = {}) =>
    fetchAPI('/gamification/award-xp', {
      method: 'POST',
      body: JSON.stringify({ action, metadata }),
    }),

  /**
   * Lấy tất cả badges (earned + available)
   */
  getBadges: async () => {
    try {
      return await fetchAPI('/gamification/badges');
    } catch {
      return { earned: 0, total: 0, badges: [] };
    }
  },

  /**
   * Lấy leaderboard (top 10)
   */
  getLeaderboard: async () => {
    try {
      return await fetchAPI('/gamification/leaderboard');
    } catch {
      return { leaderboard: [], currentUserRank: null };
    }
  },
};

// ──── Analytics API ────

export const analyticsAPI = {
  /**
   * Lấy analytics overview: trends, distributions, predictions
   * @param {number} range - 7|14|30|90 days
   */
  getOverview: async (range = 30) => {
    try {
      return await fetchAPI(`/analytics/overview?range=${range}`);
    } catch {
      return null;
    }
  },

  /**
   * Lấy concept mastery details
   * @param {string} sort - mastery|attempts|recent
   * @param {string} search - keyword filter
   */
  getConcepts: async (sort = 'mastery', search = '') => {
    try {
      const params = new URLSearchParams({ sort });
      if (search) params.set('search', search);
      return await fetchAPI(`/analytics/concepts?${params}`);
    } catch {
      return { total: 0, concepts: [] };
    }
  },
};

// ──── Notification API ────

export const notificationAPI = {
  getAll: (page = 1, limit = 20, unreadOnly = false) =>
    fetchAPI(`/notifications?page=${page}&limit=${limit}&unreadOnly=${unreadOnly}`),

  getUnreadCount: async () => {
    try {
      const data = await fetchAPI('/notifications/unread-count');
      return data?.unreadCount || 0;
    } catch { return 0; }
  },

  markRead: (id) => fetchAPI(`/notifications/${id}/read`, { method: 'PUT' }),

  markAllRead: () => fetchAPI('/notifications/read-all', { method: 'PUT' }),

  deleteNotification: (id) => fetchAPI(`/notifications/${id}`, { method: 'DELETE' }),
};

// ──── Library API ────

export const libraryAPI = {
  browse: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.limit) q.set('limit', params.limit);
    if (params.subject) q.set('subject', params.subject);
    if (params.search) q.set('search', params.search);
    if (params.sort) q.set('sort', params.sort);
    if (params.tag) q.set('tag', params.tag);
    return fetchAPI(`/library?${q}`);
  },

  getDetail: (id) => fetchAPI(`/library/${id}`),

  publish: (documentId, data = {}) =>
    fetchAPI('/library/publish', {
      method: 'POST',
      body: JSON.stringify({ documentId, ...data }),
    }),

  like: (id) => fetchAPI(`/library/${id}/like`, { method: 'POST' }),

  rate: (id, score) =>
    fetchAPI(`/library/${id}/rate`, { method: 'POST', body: JSON.stringify({ score }) }),

  unpublish: (id) => fetchAPI(`/library/${id}`, { method: 'DELETE' }),

  myPublished: () => fetchAPI('/library/my/published'),
};

// ──── OCR API ────

export const ocrAPI = {
  extract: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/ocr/extract`, {
      method: 'POST',
      headers: _buildAuthHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  },

  uploadAsDocument: async (file, title) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    const res = await fetch(`${API_BASE}/ocr/upload-as-document`, {
      method: 'POST',
      headers: _buildAuthHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  },
};

// ──── Export/Import API ────

export const exportAPI = {
  stats: () => fetchAPI('/export/stats'),

  downloadFlashcards: (format = 'csv', documentId) => {
    const q = documentId ? `?documentId=${documentId}` : '';
    return _downloadFile(`/export/flashcards/${format}${q}`);
  },

  downloadConcepts: (documentId) => {
    const q = documentId ? `?documentId=${documentId}` : '';
    return _downloadFile(`/export/concepts/csv${q}`);
  },

  downloadSessions: () => _downloadFile('/export/sessions/csv'),

  downloadDocumentMd: (docId) => _downloadFile(`/export/document/${docId}/markdown`),

  downloadBackup: () => _downloadFile('/export/backup'),

  importFlashcards: (cards, documentId) =>
    fetchAPI('/export/import/flashcards', {
      method: 'POST',
      body: JSON.stringify({ cards, documentId }),
    }),
};

async function _downloadFile(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: _buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || 'export.dat';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { filename, size: blob.size };
}
