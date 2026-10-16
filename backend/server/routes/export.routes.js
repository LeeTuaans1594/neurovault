import { Router } from 'express';
import auth from '../middleware/auth.js';
import { cacheResponse } from '../middleware/responseCache.js';
import {
  exportFlashcardsAnki, exportFlashcardsCSV, exportConceptsCSV,
  exportSessionsCSV, exportDocumentMarkdown, exportFullBackup,
} from '../services/export.service.js';
import LearnerProgress from '../models/LearnerProgress.model.js';
import KnowledgeNode from '../models/KnowledgeNode.model.js';
import StudySession from '../models/StudySession.model.js';

const router = Router();

// ──── EXPORT ENDPOINTS ────

/**
 * GET /api/export/flashcards/:format
 * Export flashcards. Format: anki | csv
 * Query: ?documentId= (optional filter)
 */
router.get('/flashcards/:format', auth, async (req, res, next) => {
  try {
    const { format } = req.params;
    const { documentId } = req.query;

    let result;
    if (format === 'anki') {
      result = await exportFlashcardsAnki(req.userId, documentId);
    } else if (format === 'csv') {
      result = await exportFlashcardsCSV(req.userId, documentId);
    } else {
      return res.status(400).json({ error: 'Format must be anki or csv' });
    }

    if (!result.content) return res.status(404).json({ error: 'No flashcards found' });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) { next(err); }
});

/**
 * GET /api/export/concepts/csv
 * Export concept mastery as CSV.
 * Query: ?documentId= (optional filter)
 */
router.get('/concepts/csv', auth, async (req, res, next) => {
  try {
    const result = await exportConceptsCSV(req.userId, req.query.documentId);
    if (!result.content) return res.status(404).json({ error: 'No concepts found' });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) { next(err); }
});

/**
 * GET /api/export/sessions/csv
 * Export study sessions as CSV.
 */
router.get('/sessions/csv', auth, async (req, res, next) => {
  try {
    const result = await exportSessionsCSV(req.userId);
    if (!result.content) return res.status(404).json({ error: 'No sessions found' });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) { next(err); }
});

/**
 * GET /api/export/document/:id/markdown
 * Export document as study notes Markdown.
 */
router.get('/document/:id/markdown', auth, async (req, res, next) => {
  try {
    const result = await exportDocumentMarkdown(req.userId, req.params.id);
    if (!result) return res.status(404).json({ error: 'Document not found' });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) { next(err); }
});

/**
 * GET /api/export/backup
 * Full JSON backup of all user data.
 */
router.get('/backup', auth, async (req, res, next) => {
  try {
    const result = await exportFullBackup(req.userId);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) { next(err); }
});

// ──── IMPORT ENDPOINTS ────

/**
 * POST /api/export/import/flashcards
 * Import flashcards from CSV or Anki TSV.
 * Body: { cards: [{ front, back }], format: 'csv'|'anki', documentId? }
 */
router.post('/import/flashcards', auth, async (req, res, next) => {
  try {
    const { cards, documentId } = req.body;
    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'cards array required' });
    }

    // Validate cards
    const validCards = cards.filter(c => c.front && c.back).slice(0, 500);
    if (validCards.length === 0) {
      return res.status(400).json({ error: 'No valid cards found (need front + back fields)' });
    }

    let progress = await LearnerProgress.findOne({ user_id: req.userId });
    if (!progress) {
      progress = new LearnerProgress({ user_id: req.userId });
    }

    let imported = 0;
    let skipped = 0;

    for (const card of validCards) {
      // Check for duplicates
      const exists = progress.flashcard_states.some(
        s => s.front === card.front && s.back === card.back
      );

      if (exists) {
        skipped++;
        continue;
      }

      progress.flashcard_states.push({
        card_id: `imp_${Date.now()}_${imported}`,
        document_id: documentId || null,
        front: card.front.slice(0, 1000),
        back: card.back.slice(0, 2000),
        stability: 1.0,
        difficulty: 5.0,
        elapsed_days: 0,
        review_count: 0,
        next_review_at: new Date(),
        last_reviewed_at: null,
        rating_history: [],
      });
      imported++;
    }

    await progress.save();

    res.json({
      message: `Imported ${imported} flashcards, skipped ${skipped} duplicates`,
      imported, skipped, total: progress.flashcard_states.length,
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/export/stats
 * Get export counts (how much data user has to export).
 */
router.get('/stats', auth, cacheResponse(180), async (req, res, next) => {
  try {
    const progress = await LearnerProgress.findOne({ user_id: req.userId }).lean();
    const [conceptCount, sessionCount] = await Promise.all([
      KnowledgeNode.countDocuments({ user_id: req.userId }),
      StudySession.countDocuments({ user_id: req.userId }),
    ]);

    res.json({
      flashcards: progress?.flashcard_states?.length || 0,
      concepts: conceptCount,
      sessions: sessionCount,
    });
  } catch (err) { next(err); }
});

export default router;
