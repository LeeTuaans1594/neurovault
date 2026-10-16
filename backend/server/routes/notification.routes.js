import { Router } from 'express';
import auth from '../middleware/auth.js';
import Notification from '../models/Notification.model.js';
import { notificationBus } from '../services/notification.service.js';

const router = Router();

/**
 * GET /api/notifications
 * List notifications (paginated). Query: ?page=1&limit=20&unreadOnly=false
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const filter = { user_id: req.userId };
    if (req.query.unreadOnly === 'true') filter.read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user_id: req.userId, read: false }),
    ]);

    res.json({ notifications, total, unreadCount, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

/**
 * GET /api/notifications/unread-count
 * Quick unread count for badge display
 */
router.get('/unread-count', auth, async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ user_id: req.userId, read: false });
    res.json({ unreadCount: count });
  } catch (err) { next(err); }
});

/**
 * PUT /api/notifications/:id/read
 * Mark single notification as read
 */
router.put('/:id/read', auth, async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user_id: req.userId },
      { read: true },
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', auth, async (req, res, next) => {
  try {
    await Notification.updateMany({ user_id: req.userId, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/notifications/:id
 * Delete single notification
 */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user_id: req.userId });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/notifications/stream
 * Server-Sent Events for real-time notifications.
 * Uses query param ?token=JWT since EventSource API can't set headers.
 */
import jwt from 'jsonwebtoken';
import config from '../config/env.js';

router.get('/stream', (req, res) => {
  // Manual JWT auth from query param
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  let userId;
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('data: {"type":"connected"}\n\n');

  const userIdStr = userId.toString();
  const onNotification = ({ userId: targetId, notification }) => {
    if (targetId === userIdStr) {
      res.write(`data: ${JSON.stringify({ type: 'notification', data: notification })}\n\n`);
    }
  };

  notificationBus.on('notification', onNotification);

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    notificationBus.off('notification', onNotification);
    clearInterval(heartbeat);
  });
});

export default router;
