import { Router } from 'express';
import auth from '../middleware/auth.js';
import { getCollabStats } from '../collaboration.js';

const router = Router();

/**
 * GET /api/collab/stats
 * Current collaboration stats: rooms, clients, quizzes
 */
router.get('/stats', auth, async (req, res) => {
  const stats = getCollabStats();
  res.json(stats);
});

export default router;
