import { Router } from 'express';
import auth from '../middleware/auth.js';
import { cacheResponse } from '../middleware/responseCache.js';
import Gamification from '../models/Gamification.model.js';
import LearnerProgress from '../models/LearnerProgress.model.js';

const router = Router();

// ══════════════════════════════════════════════
// BADGE DEFINITIONS — tất cả badges có thể đạt được
// ══════════════════════════════════════════════

const BADGE_DEFINITIONS = [
  // ── Documents ──
  { badge_id: 'first_upload', name: 'First Upload', icon: '📚', category: 'documents',
    description: 'Upload your first document', condition: (lt) => lt.documents_uploaded >= 1 },
  { badge_id: 'bookworm', name: 'Bookworm', icon: '📖', category: 'documents',
    description: 'Upload 10 documents', condition: (lt) => lt.documents_uploaded >= 10 },
  { badge_id: 'scholar', name: 'Scholar', icon: '🏛️', category: 'documents',
    description: 'Upload 50 documents', condition: (lt) => lt.documents_uploaded >= 50 },

  // ── Quizzes ──
  { badge_id: 'quiz_starter', name: 'Quiz Starter', icon: '🧪', category: 'quizzes',
    description: 'Complete your first quiz', condition: (lt) => lt.quizzes_completed >= 1 },
  { badge_id: 'sharp_mind', name: 'Sharp Mind', icon: '🎯', category: 'quizzes',
    description: 'Get 100% on a quiz', condition: (lt) => lt.perfect_quizzes >= 1 },
  { badge_id: 'quiz_master', name: 'Quiz Master', icon: '🏆', category: 'quizzes',
    description: 'Complete 50 quizzes', condition: (lt) => lt.quizzes_completed >= 50 },

  // ── Flashcards ──
  { badge_id: 'card_rookie', name: 'Card Rookie', icon: '🃏', category: 'flashcards',
    description: 'Review your first flashcard', condition: (lt) => lt.flashcards_reviewed >= 1 },
  { badge_id: 'card_shark', name: 'Card Shark', icon: '♠️', category: 'flashcards',
    description: 'Review 500 flashcards', condition: (lt) => lt.flashcards_reviewed >= 500 },
  { badge_id: 'memory_diamond', name: 'Memory Diamond', icon: '💎', category: 'flashcards',
    description: 'Review 1000 flashcards', condition: (lt) => lt.flashcards_reviewed >= 1000 },

  // ── Streaks ──
  { badge_id: 'streak_3', name: '3-Day Streak', icon: '🔥', category: 'streaks',
    description: 'Maintain a 3-day streak', condition: (lt, extra) => (extra?.streak?.longest || 0) >= 3 },
  { badge_id: 'streak_7', name: 'Weekly Warrior', icon: '⚡', category: 'streaks',
    description: 'Maintain a 7-day streak', condition: (lt, extra) => (extra?.streak?.longest || 0) >= 7 },
  { badge_id: 'streak_30', name: 'Unstoppable', icon: '🌟', category: 'streaks',
    description: 'Maintain a 30-day streak', condition: (lt, extra) => (extra?.streak?.longest || 0) >= 30 },

  // ── Engagement ──
  { badge_id: 'curious_learner', name: 'Curious Learner', icon: '💬', category: 'engagement',
    description: 'Send 100 chat messages', condition: (lt) => lt.chat_messages >= 100 },
  { badge_id: 'study_marathon', name: 'Study Marathon', icon: '⏰', category: 'engagement',
    description: 'Study for 600 minutes total', condition: (lt) => lt.total_study_minutes >= 600 },

  // ── Mastery ──
  { badge_id: 'knowledge_builder', name: 'Knowledge Builder', icon: '🧠', category: 'mastery',
    description: 'Master 50 concepts', condition: (lt) => lt.concepts_mastered >= 50 },
];

// ══════════════════════════════════════════════
// XP TABLE — XP per action
// ══════════════════════════════════════════════

const XP_TABLE = {
  upload_document: 50,
  complete_quiz: 20,   // + bonus: score% * 30
  review_flashcard: 5, // per card
  chat_message: 3,
  daily_login: 10,
  daily_challenge: 100,
  reading_session: 2,  // per minute
};

// ══════════════════════════════════════════════
// DAILY CHALLENGE TEMPLATES
// ══════════════════════════════════════════════

const CHALLENGE_TEMPLATES = [
  { challenge_type: 'quiz_score', title: 'Quiz Champion', description: 'Score 80%+ on a quiz', target: 80 },
  { challenge_type: 'flashcard_count', title: 'Card Blitz', description: 'Review 20 flashcards', target: 20 },
  { challenge_type: 'study_time', title: 'Deep Focus', description: 'Study for 30 minutes', target: 30 },
  { challenge_type: 'chat_count', title: 'Curious Mind', description: 'Ask 5 questions to AI', target: 5 },
  { challenge_type: 'flashcard_count', title: 'Memory Sprint', description: 'Review 10 flashcards', target: 10 },
  { challenge_type: 'study_time', title: 'Quick Session', description: 'Study for 15 minutes', target: 15 },
  { challenge_type: 'quiz_score', title: 'Perfect Score', description: 'Get 100% on a quiz', target: 100 },
];

// ══════════════════════════════════════════════
// HELPER: Get or create gamification profile
// ══════════════════════════════════════════════

async function getOrCreateProfile(userId) {
  let profile = await Gamification.findOne({ user_id: userId });
  if (!profile) {
    profile = await Gamification.create({ user_id: userId });
  }
  return profile;
}

/**
 * Generate today's daily challenge (deterministic based on date)
 */
function generateDailyChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  // Use day-of-year as seed for deterministic selection
  const dayOfYear = Math.floor(
    (new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  const template = CHALLENGE_TEMPLATES[dayOfYear % CHALLENGE_TEMPLATES.length];

  return {
    date: today,
    ...template,
    progress: 0,
    completed: false,
    completed_at: null,
    xp_reward: 100,
  };
}

// ══════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════

/**
 * GET /api/gamification/profile
 * Full gamification profile: XP, level, tier, badges, challenge, recent XP log
 */
router.get('/profile', auth, async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.userId);

    // Ensure today's daily challenge exists
    const today = new Date().toISOString().slice(0, 10);
    let todayChallenge = profile.daily_challenges.find(c => c.date === today);
    if (!todayChallenge) {
      todayChallenge = generateDailyChallenge();
      profile.daily_challenges.push(todayChallenge);
      // Clean old challenges (keep last 7)
      if (profile.daily_challenges.length > 7) {
        profile.daily_challenges = profile.daily_challenges.slice(-7);
      }
      await profile.save();
    }

    // Daily login XP (once per day)
    if (profile.last_login_date !== today) {
      profile.last_login_date = today;
      profile.lifetime.login_days = (profile.lifetime.login_days || 0) + 1;
      const loginResult = profile.awardXP(XP_TABLE.daily_login, 'daily_login', 'Daily login bonus');
      await profile.save();
    }

    // Calculate progress to next level
    const progressToNext = Gamification.progressToNextLevel(profile.xp);
    const nextLevelXP = Gamification.xpForLevel(profile.level + 1);
    const currentLevelXP = Gamification.xpForLevel(profile.level);

    res.json({
      xp: profile.xp,
      level: profile.level,
      tier: profile.tier,
      progressToNextLevel: Math.round(progressToNext * 100),
      xpForCurrentLevel: currentLevelXP,
      xpForNextLevel: nextLevelXP,
      badges: profile.badges,
      totalBadgesAvailable: BADGE_DEFINITIONS.length,
      dailyChallenge: todayChallenge,
      lifetime: profile.lifetime,
      recentXP: profile.xp_log.slice(-10).reverse(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/gamification/award-xp
 * Award XP for an action. Called internally from record-activity hook.
 * Body: { action, amount?, metadata? }
 */
router.post('/award-xp', auth, async (req, res, next) => {
  try {
    const { action, amount, metadata = {} } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const profile = await getOrCreateProfile(req.userId);

    // Calculate XP amount
    let xpAmount = amount;
    if (!xpAmount) {
      xpAmount = XP_TABLE[action] || 0;
    }

    // Quiz bonus: base + score% * 30
    if (action === 'complete_quiz' && metadata.scorePercent != null) {
      xpAmount = XP_TABLE.complete_quiz + Math.round((metadata.scorePercent / 100) * 30);

      // Track perfect quizzes
      if (metadata.scorePercent >= 100) {
        profile.lifetime.perfect_quizzes = (profile.lifetime.perfect_quizzes || 0) + 1;
      }
    }

    // Flashcard: per card
    if (action === 'review_flashcard' && metadata.cardsReviewed) {
      xpAmount = XP_TABLE.review_flashcard * metadata.cardsReviewed;
    }

    // Reading: per minute
    if (action === 'reading_session' && metadata.durationMinutes) {
      xpAmount = XP_TABLE.reading_session * Math.ceil(metadata.durationMinutes);
    }

    if (xpAmount <= 0) {
      return res.json({ xpGained: 0, leveledUp: false });
    }

    // Award XP
    const result = profile.awardXP(xpAmount, action, metadata.description || action);

    // Update lifetime counters
    if (action === 'upload_document') {
      profile.lifetime.documents_uploaded = (profile.lifetime.documents_uploaded || 0) + 1;
    } else if (action === 'complete_quiz') {
      profile.lifetime.quizzes_completed = (profile.lifetime.quizzes_completed || 0) + 1;
    } else if (action === 'review_flashcard') {
      profile.lifetime.flashcards_reviewed = (profile.lifetime.flashcards_reviewed || 0) +
        (metadata.cardsReviewed || 1);
    } else if (action === 'chat_message') {
      profile.lifetime.chat_messages = (profile.lifetime.chat_messages || 0) + 1;
    }

    // Update study time
    if (metadata.durationMinutes) {
      profile.lifetime.total_study_minutes = (profile.lifetime.total_study_minutes || 0) +
        Math.ceil(metadata.durationMinutes);
    }

    // Update daily challenge progress
    const today = new Date().toISOString().slice(0, 10);
    const todayChallenge = profile.daily_challenges.find(c => c.date === today && !c.completed);
    if (todayChallenge) {
      const updated = updateChallengeProgress(todayChallenge, action, metadata);
      if (updated && todayChallenge.completed) {
        // Award daily challenge XP
        profile.awardXP(todayChallenge.xp_reward, 'daily_challenge', todayChallenge.title);
        todayChallenge.completed_at = new Date();
      }
    }

    // Check for new badges
    const progress = await LearnerProgress.findOne({ user_id: req.userId }).lean();
    const newBadges = checkBadges(profile, progress);

    await profile.save();

    res.json({
      ...result,
      newBadges: newBadges.map(b => ({
        badge_id: b.badge_id,
        name: b.name,
        icon: b.icon,
        description: b.description,
      })),
      dailyChallengeCompleted: todayChallenge?.completed || false,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gamification/badges
 * All badges: earned + available with progress
 */
router.get('/badges', auth, async (req, res, next) => {
  try {
    const profile = await getOrCreateProfile(req.userId);
    const progress = await LearnerProgress.findOne({ user_id: req.userId }).lean();

    const badges = BADGE_DEFINITIONS.map(def => {
      const earned = profile.badges.find(b => b.badge_id === def.badge_id);
      return {
        badge_id: def.badge_id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        earned: !!earned,
        earned_at: earned?.earned_at || null,
      };
    });

    res.json({
      earned: badges.filter(b => b.earned).length,
      total: badges.length,
      badges,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gamification/leaderboard
 * Top 10 users by XP
 */
router.get('/leaderboard', auth, cacheResponse(120), async (req, res, next) => {
  try {
    const leaderboard = await Gamification.find()
      .sort({ xp: -1 })
      .limit(10)
      .populate('user_id', 'name avatar')
      .lean();

    const entries = leaderboard.map((entry, index) => ({
      rank: index + 1,
      name: entry.user_id?.name || 'Anonymous',
      avatar: entry.user_id?.avatar || '',
      xp: entry.xp,
      level: entry.level,
      tier: entry.tier,
      badges: entry.badges?.length || 0,
      isCurrentUser: entry.user_id?._id?.toString() === req.userId?.toString(),
    }));

    // Find current user's rank if not in top 10
    let userRank = entries.find(e => e.isCurrentUser);
    if (!userRank) {
      const userProfile = await Gamification.findOne({ user_id: req.userId });
      if (userProfile) {
        const rank = await Gamification.countDocuments({ xp: { $gt: userProfile.xp } }) + 1;
        userRank = {
          rank,
          xp: userProfile.xp,
          level: userProfile.level,
          tier: userProfile.tier,
          isCurrentUser: true,
        };
      }
    }

    res.json({ leaderboard: entries, currentUserRank: userRank });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════

/**
 * Update daily challenge progress based on action
 */
function updateChallengeProgress(challenge, action, metadata) {
  let updated = false;

  switch (challenge.challenge_type) {
    case 'quiz_score':
      if (action === 'complete_quiz' && metadata.scorePercent != null) {
        challenge.progress = Math.max(challenge.progress, Math.round(metadata.scorePercent));
        if (challenge.progress >= challenge.target) {
          challenge.completed = true;
        }
        updated = true;
      }
      break;

    case 'flashcard_count':
      if (action === 'review_flashcard') {
        challenge.progress += (metadata.cardsReviewed || 1);
        if (challenge.progress >= challenge.target) {
          challenge.completed = true;
        }
        updated = true;
      }
      break;

    case 'study_time':
      if (metadata.durationMinutes) {
        challenge.progress += Math.ceil(metadata.durationMinutes);
        if (challenge.progress >= challenge.target) {
          challenge.completed = true;
        }
        updated = true;
      }
      break;

    case 'chat_count':
      if (action === 'chat_message') {
        challenge.progress += 1;
        if (challenge.progress >= challenge.target) {
          challenge.completed = true;
        }
        updated = true;
      }
      break;

    case 'upload_doc':
      if (action === 'upload_document') {
        challenge.progress += 1;
        if (challenge.progress >= challenge.target) {
          challenge.completed = true;
        }
        updated = true;
      }
      break;
  }

  return updated;
}

/**
 * Check all badge conditions and award new ones
 */
function checkBadges(profile, learnerProgress) {
  const newBadges = [];
  const streak = learnerProgress?.streak || {};

  for (const def of BADGE_DEFINITIONS) {
    const alreadyHas = profile.badges.some(b => b.badge_id === def.badge_id);
    if (alreadyHas) continue;

    const met = def.condition(profile.lifetime, { streak });
    if (met) {
      const awarded = profile.tryAwardBadge(def);
      if (awarded) {
        newBadges.push(awarded);
      }
    }
  }

  return newBadges;
}

export default router;
