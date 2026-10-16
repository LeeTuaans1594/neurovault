import { Router } from 'express';
import Annotation from '../models/Annotation.model.js';
import Document from '../models/Document.model.js';
import auth from '../middleware/auth.js';

const router = Router();

// Tất cả routes cần authentication
router.use(auth);

/**
 * GET /api/annotations/:documentId
 * Lấy tất cả annotations của user cho 1 document
 */
router.get('/:documentId', async (req, res, next) => {
  try {
    const annotations = await Annotation.find({
      user_id: req.userId,
      document_id: req.params.documentId,
    }).sort({ createdAt: -1 }).lean();

    res.json({ annotations });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/annotations
 * Tạo annotation mới
 * Body: { document_id, type, text_selection?, chunk_index?, content?, color? }
 */
router.post('/', async (req, res, next) => {
  try {
    const { document_id, type, text_selection, chunk_index, content, color } = req.body;

    if (!document_id || !type) {
      return res.status(400).json({ error: 'document_id and type are required.' });
    }

    // Verify document belongs to user
    const doc = await Document.findOne({
      _id: document_id,
      user_id: req.userId,
    }).select('_id');

    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const annotation = new Annotation({
      user_id: req.userId,
      document_id,
      type,
      text_selection: text_selection || {},
      chunk_index: chunk_index ?? -1,
      content: content || '',
      color: color || 'yellow',
    });

    await annotation.save();

    res.status(201).json({ annotation });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/annotations/:id
 * Cập nhật annotation (content, color, is_pinned)
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { content, color, is_pinned } = req.body;

    const updates = {};
    if (content !== undefined) updates.content = content;
    if (color !== undefined) updates.color = color;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;

    const annotation = await Annotation.findOneAndUpdate(
      { _id: req.params.id, user_id: req.userId },
      { $set: updates },
      { new: true }
    );

    if (!annotation) {
      return res.status(404).json({ error: 'Annotation not found.' });
    }

    res.json({ annotation });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/annotations/:id
 * Xóa annotation
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const annotation = await Annotation.findOneAndDelete({
      _id: req.params.id,
      user_id: req.userId,
    });

    if (!annotation) {
      return res.status(404).json({ error: 'Annotation not found.' });
    }

    res.json({ message: 'Annotation deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
