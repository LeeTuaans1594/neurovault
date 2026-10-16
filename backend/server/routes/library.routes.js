import { Router } from 'express';
import auth from '../middleware/auth.js';
import { cacheResponse } from '../middleware/responseCache.js';
import SharedContent from '../models/SharedContent.model.js';
import Document from '../models/Document.model.js';

const router = Router();

const SUBJECTS = ['cs', 'math', 'science', 'language', 'history', 'business', 'art', 'other'];

/**
 * GET /api/library
 * Browse public content library.
 * Query: ?page=1&limit=12&subject=&search=&sort=recent|popular|rating&tag=
 */
router.get('/', auth, cacheResponse(120, { perUser: false }), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(30, parseInt(req.query.limit) || 12);
    const { subject, search, sort = 'recent', tag } = req.query;

    const filter = { status: 'published' };
    if (subject && SUBJECTS.includes(subject)) filter.subject = subject;
    if (tag) filter.tags = tag.toLowerCase();

    let query;
    if (search) {
      filter.$text = { $search: search };
      query = SharedContent.find(filter, { score: { $meta: 'textScore' } });
      if (sort === 'recent') query = query.sort({ score: { $meta: 'textScore' } });
    } else {
      query = SharedContent.find(filter);
    }

    // Sort
    if (!search || sort !== 'recent') {
      if (sort === 'popular') query = query.sort({ downloads: -1, likes: -1 });
      else if (sort === 'rating') query = query.sort({ average_rating: -1, rating_count: -1 });
      else query = query.sort({ createdAt: -1 });
    }

    const [items, total] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit)
        .populate('author_id', 'name avatar')
        .lean(),
      SharedContent.countDocuments(filter),
    ]);

    // Check which ones current user liked
    const userId = req.userId.toString();
    const results = items.map(item => ({
      ...item,
      author: { name: item.author_id?.name || 'Anonymous', avatar: item.author_id?.avatar || '' },
      isLiked: item.liked_by?.some(id => id.toString() === userId) || false,
      liked_by: undefined, // Don't expose full list
      author_id: undefined,
    }));

    // Get featured items (only on page 1)
    let featured = [];
    if (page === 1 && !search && !subject) {
      featured = await SharedContent.find({ status: 'published', featured: true })
        .sort({ average_rating: -1 }).limit(3)
        .populate('author_id', 'name avatar').lean();
      featured = featured.map(f => ({
        ...f,
        author: { name: f.author_id?.name, avatar: f.author_id?.avatar },
        isLiked: f.liked_by?.some(id => id.toString() === userId),
        liked_by: undefined, author_id: undefined,
      }));
    }

    res.json({ items: results, total, page, limit, totalPages: Math.ceil(total / limit), featured, subjects: SUBJECTS });
  } catch (err) { next(err); }
});

/**
 * POST /api/library/publish
 * Publish a document to the community library.
 * Body: { documentId, description, subject, tags }
 */
router.post('/publish', auth, async (req, res, next) => {
  try {
    const { documentId, description, subject, tags = [] } = req.body;
    if (!documentId) return res.status(400).json({ error: 'documentId required' });

    const doc = await Document.findOne({ _id: documentId, user_id: req.userId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.metadata?.processing_status !== 'completed') {
      return res.status(400).json({ error: 'Document must be fully processed before publishing' });
    }

    // Check if already published
    const existing = await SharedContent.findOne({ document_id: documentId, author_id: req.userId });
    if (existing) return res.status(409).json({ error: 'Document already published', sharedId: existing._id });

    // Create preview
    const preview = (doc.raw_text || '').slice(0, 500).replace(/\s+/g, ' ').trim();
    const conceptCount = doc.chunks?.reduce((sum, c) => sum + (c.concepts?.length || 0), 0) || 0;

    const shared = await SharedContent.create({
      document_id: documentId,
      author_id: req.userId,
      title: doc.title,
      description: description || '',
      subject: subject || 'other',
      tags: (tags || []).slice(0, 10).map(t => t.toLowerCase().trim()).filter(Boolean),
      language: (doc.language && ['vi', 'en', 'mixed'].includes(doc.language)) ? doc.language : 'en',
      content_preview: preview,
      word_count: doc.metadata?.word_count || 0,
      concept_count: conceptCount,
    });

    res.status(201).json({ message: 'Published to library', shared });
  } catch (err) { next(err); }
});

/**
 * POST /api/library/:id/like
 * Toggle like on a shared content
 */
router.post('/:id/like', auth, async (req, res, next) => {
  try {
    const content = await SharedContent.findById(req.params.id);
    if (!content) return res.status(404).json({ error: 'Not found' });

    const userId = req.userId;
    const idx = content.liked_by.findIndex(id => id.toString() === userId.toString());

    if (idx >= 0) {
      content.liked_by.splice(idx, 1);
      content.likes = Math.max(0, content.likes - 1);
    } else {
      content.liked_by.push(userId);
      content.likes += 1;
    }
    await content.save();

    res.json({ liked: idx < 0, likes: content.likes });
  } catch (err) { next(err); }
});

/**
 * POST /api/library/:id/rate
 * Rate shared content (1-5). Body: { score }
 */
router.post('/:id/rate', auth, async (req, res, next) => {
  try {
    const { score } = req.body;
    if (!score || score < 1 || score > 5) return res.status(400).json({ error: 'score must be 1-5' });

    const content = await SharedContent.findById(req.params.id);
    if (!content) return res.status(404).json({ error: 'Not found' });

    // Update or add rating
    const existing = content.ratings.find(r => r.user_id.toString() === req.userId.toString());
    if (existing) {
      existing.score = score;
    } else {
      content.ratings.push({ user_id: req.userId, score });
    }

    // Recalc average
    content.rating_count = content.ratings.length;
    content.average_rating = Math.round(
      (content.ratings.reduce((sum, r) => sum + r.score, 0) / content.ratings.length) * 10
    ) / 10;

    await content.save();
    res.json({ averageRating: content.average_rating, ratingCount: content.rating_count });
  } catch (err) { next(err); }
});

/**
 * GET /api/library/my/published
 * List current user's published content
 * NOTE: Must be defined BEFORE /:id to prevent Express matching 'my' as param
 */
router.get('/my/published', auth, async (req, res, next) => {
  try {
    const items = await SharedContent.find({ author_id: req.userId })
      .sort({ createdAt: -1 }).lean();
    res.json({ items, total: items.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/library/:id
 * Get single shared content detail (increments views)
 */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const content = await SharedContent.findByIdAndUpdate(
      req.params.id, { $inc: { views: 1 } }, { new: true }
    ).populate('author_id', 'name avatar').lean();

    if (!content) return res.status(404).json({ error: 'Not found' });

    const userId = req.userId.toString();
    const userRating = content.ratings?.find(r => r.user_id?.toString() === userId);

    res.json({
      ...content,
      author: { name: content.author_id?.name, avatar: content.author_id?.avatar },
      isLiked: content.liked_by?.some(id => id.toString() === userId),
      userRating: userRating?.score || null,
      liked_by: undefined, author_id: undefined,
    });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/library/:id
 * Unpublish (only by author)
 */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const result = await SharedContent.findOneAndDelete({ _id: req.params.id, author_id: req.userId });
    if (!result) return res.status(404).json({ error: 'Not found or not your content' });
    res.json({ success: true });
  } catch (err) { next(err); }
});
export default router;
