import { Router } from 'express';
import auth from '../middleware/auth.js';
import LearnerProgress from '../models/LearnerProgress.model.js';
import StudySession from '../models/StudySession.model.js';
import Document from '../models/Document.model.js';

const router = Router();

/**
 * GET /api/learning/dashboard-stats
 * Trả về toàn bộ data cho Dashboard v2:
 * - streak: current, longest, lastStudyDate
 * - heatmap: 365 ngày gần nhất (date + count)
 * - weeklyActivity: 7 ngày gần nhất (study time per day)
 * - masteryOverview: tổng hợp mastery levels
 * - recentActivity: 5 sessions gần nhất
 * - stats: tổng hợp số liệu
 */
router.get('/dashboard-stats', auth, async (req, res, next) => {
  try {
    const userId = req.userId;

    // ── 1. Lấy hoặc tạo LearnerProgress ──
    let progress = await LearnerProgress.findOne({ user_id: userId });
    if (!progress) {
      progress = await LearnerProgress.create({ user_id: userId });
    }

    // ── 2. Tính streak thực tế từ StudySession ──
    const streak = await calculateStreak(userId, progress);

    // ── 3. Activity Heatmap — 365 ngày gần nhất ──
    const heatmapData = await generateHeatmap(userId);

    // ── 4. Weekly Activity — 7 ngày gần nhất ──
    const weeklyActivity = await generateWeeklyActivity(userId);

    // ── 5. Mastery Overview — phân bổ mastery levels ──
    const masteryOverview = calculateMasteryOverview(progress);

    // ── 6. Recent Activity — 5 sessions gần nhất ──
    const recentSessions = await StudySession.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('document_id', 'title')
      .lean();

    const recentActivity = recentSessions.map(s => ({
      id: s._id,
      type: s.session_type,
      documentTitle: s.document_id?.title || 'Unknown',
      duration: s.duration_seconds || 0,
      score: s.quiz_results?.score_percentage || null,
      cardsReviewed: s.flashcard_results?.cards_reviewed || null,
      date: s.createdAt,
    }));

    // ── 7. Tổng hợp stats ──
    const totalDocuments = await Document.countDocuments({
      user: userId,
      'metadata.processing_status': { $ne: 'failed' },
    });

    const stats = {
      totalDocuments,
      totalConcepts: progress.concept_mastery?.length || 0,
      totalStudyTimeMinutes: Math.round(
        (progress.stats?.total_study_time_seconds || 0) / 60
      ),
      totalQuizzesTaken: progress.stats?.total_quizzes_taken || 0,
      totalFlashcardsReviewed: progress.stats?.total_flashcards_reviewed || 0,
      totalChatMessages: progress.stats?.total_chat_messages || 0,
      averageQuizScore: Math.round(progress.stats?.average_quiz_score || 0),
      dueFlashcards: countDueFlashcards(progress),
    };

    res.json({
      streak,
      heatmapData,
      weeklyActivity,
      masteryOverview,
      recentActivity,
      stats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/learning/record-activity
 * Ghi nhận activity mới (khi user hoàn thành quiz/flashcard/chat/reading session)
 * Body: { type, documentId, durationSeconds, results? }
 */
router.post('/record-activity', auth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      type,
      documentId,
      durationSeconds = 0,
      results = {},
    } = req.body;

    const validTypes = ['quiz', 'flashcard', 'chat', 'reading'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${validTypes.join(', ')}`,
        code: 'INVALID_PARAMS',
      });
    }

    // Tạo StudySession
    const sessionData = {
      user_id: userId,
      document_id: documentId,
      session_type: type,
      started_at: new Date(Date.now() - durationSeconds * 1000),
      ended_at: new Date(),
      duration_seconds: durationSeconds,
    };

    if (type === 'quiz' && results.quiz) {
      sessionData.quiz_results = results.quiz;
    }
    if (type === 'flashcard' && results.flashcard) {
      sessionData.flashcard_results = results.flashcard;
    }
    if (results.concepts) {
      sessionData.concepts_covered = results.concepts;
    }

    const session = await StudySession.create(sessionData);

    // Cập nhật LearnerProgress stats
    let progress = await LearnerProgress.findOne({ user_id: userId });
    if (!progress) {
      progress = await LearnerProgress.create({ user_id: userId });
    }

    // Update study time
    progress.stats.total_study_time_seconds =
      (progress.stats.total_study_time_seconds || 0) + durationSeconds;

    // Update type-specific counters
    if (type === 'quiz') {
      progress.stats.total_quizzes_taken =
        (progress.stats.total_quizzes_taken || 0) + 1;
    } else if (type === 'flashcard') {
      progress.stats.total_flashcards_reviewed =
        (progress.stats.total_flashcards_reviewed || 0) +
        (results.flashcard?.cards_reviewed || 0);
    } else if (type === 'chat') {
      progress.stats.total_chat_messages =
        (progress.stats.total_chat_messages || 0) + 1;
    }

    // Update streak
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (progress.streak.last_study_date !== todayStr) {
      const lastDate = progress.streak.last_study_date;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      if (lastDate === yesterdayStr) {
        // Tiếp nối streak
        progress.streak.current = (progress.streak.current || 0) + 1;
      } else if (lastDate !== todayStr) {
        // Mất streak — reset về 1
        progress.streak.current = 1;
      }

      progress.streak.last_study_date = todayStr;
      progress.streak.longest = Math.max(
        progress.streak.longest || 0,
        progress.streak.current
      );
    }

    await progress.save();

    // ── Gamification: Award XP ──
    let gamificationResult = null;
    try {
      const Gamification = (await import('../models/Gamification.model.js')).default;

      let gamProfile = await Gamification.findOne({ user_id: userId });
      if (!gamProfile) {
        gamProfile = await Gamification.create({ user_id: userId });
      }

      let xpAmount = 0;
      const metadata = { durationMinutes: Math.ceil(durationSeconds / 60) };

      if (type === 'quiz') {
        xpAmount = 20 + Math.round(((results.quiz?.score_percentage || 0) / 100) * 30);
        metadata.scorePercent = results.quiz?.score_percentage || 0;
        gamProfile.lifetime.quizzes_completed = (gamProfile.lifetime.quizzes_completed || 0) + 1;
        if (metadata.scorePercent >= 100) {
          gamProfile.lifetime.perfect_quizzes = (gamProfile.lifetime.perfect_quizzes || 0) + 1;
        }
      } else if (type === 'flashcard') {
        const cards = results.flashcard?.cards_reviewed || 1;
        xpAmount = 5 * cards;
        metadata.cardsReviewed = cards;
        gamProfile.lifetime.flashcards_reviewed = (gamProfile.lifetime.flashcards_reviewed || 0) + cards;
      } else if (type === 'chat') {
        xpAmount = 3;
        gamProfile.lifetime.chat_messages = (gamProfile.lifetime.chat_messages || 0) + 1;
      } else if (type === 'reading') {
        xpAmount = 2 * Math.max(1, Math.ceil(durationSeconds / 60));
      }

      // Update study time
      gamProfile.lifetime.total_study_minutes = (gamProfile.lifetime.total_study_minutes || 0) +
        Math.ceil(durationSeconds / 60);

      if (xpAmount > 0) {
        gamificationResult = gamProfile.awardXP(xpAmount, type === 'quiz' ? 'complete_quiz' :
          type === 'flashcard' ? 'review_flashcard' :
          type === 'chat' ? 'chat_message' : 'reading_session', type);
      }

      // Check daily challenge
      const today = new Date().toISOString().slice(0, 10);
      const todayChallenge = gamProfile.daily_challenges.find(c => c.date === today && !c.completed);
      if (todayChallenge) {
        const action = type === 'quiz' ? 'complete_quiz' :
          type === 'flashcard' ? 'review_flashcard' :
          type === 'chat' ? 'chat_message' : 'reading_session';

        // Update challenge progress inline
        if (todayChallenge.challenge_type === 'quiz_score' && type === 'quiz') {
          todayChallenge.progress = Math.max(todayChallenge.progress, Math.round(metadata.scorePercent || 0));
        } else if (todayChallenge.challenge_type === 'flashcard_count' && type === 'flashcard') {
          todayChallenge.progress += (metadata.cardsReviewed || 1);
        } else if (todayChallenge.challenge_type === 'study_time') {
          todayChallenge.progress += Math.ceil(durationSeconds / 60);
        } else if (todayChallenge.challenge_type === 'chat_count' && type === 'chat') {
          todayChallenge.progress += 1;
        }

        if (todayChallenge.progress >= todayChallenge.target && !todayChallenge.completed) {
          todayChallenge.completed = true;
          todayChallenge.completed_at = new Date();
          gamProfile.awardXP(todayChallenge.xp_reward || 100, 'daily_challenge', todayChallenge.title);
        }
      }

      await gamProfile.save();

      // ── Notifications ──
      try {
        const { NotificationTemplates } = await import('../services/notification.service.js');

        // Level up notification
        if (gamificationResult?.leveledUp) {
          await NotificationTemplates.levelUp(userId, gamificationResult.newLevel, gamificationResult.newTier);
        }

        // Daily challenge complete
        if (todayChallenge?.completed && todayChallenge?.completed_at) {
          await NotificationTemplates.dailyChallengeComplete(userId, todayChallenge.title, todayChallenge.xp_reward || 100);
        }

        // Quiz score notification
        if (type === 'quiz' && metadata.scorePercent != null) {
          await NotificationTemplates.quizComplete(userId, Math.round(metadata.scorePercent), results.quiz?.document_title);
        }
      } catch (notifErr) {
        console.error('[Notification] Error:', notifErr.message);
      }
    } catch (gamErr) {
      // Non-critical — don't break activity recording
      console.error('[Gamification] XP award error:', gamErr.message);
    }

    res.status(201).json({
      message: 'Activity recorded',
      session: { id: session._id, type, duration: durationSeconds },
      streak: progress.streak,
      gamification: gamificationResult,
    });
  } catch (err) {
    next(err);
  }
});

// ═══ HELPER FUNCTIONS ═══

/**
 * Tính toán streak hiện tại từ LearnerProgress + StudySession
 */
async function calculateStreak(userId, progress) {
  const streak = {
    current: progress.streak?.current || 0,
    longest: progress.streak?.longest || 0,
    lastStudyDate: progress.streak?.last_study_date || null,
    isActiveToday: false,
  };

  // Kiểm tra xem hôm nay đã học chưa
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaySession = await StudySession.findOne({
    user_id: userId,
    createdAt: { $gte: today },
  }).lean();

  streak.isActiveToday = !!todaySession;

  // Nếu chưa học hôm nay, kiểm tra xem streak có bị gãy không
  if (!streak.isActiveToday && streak.lastStudyDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (streak.lastStudyDate < yesterdayStr) {
      // Streak đã gãy
      streak.current = 0;
    }
  }

  return streak;
}

/**
 * Tạo heatmap data 365 ngày
 * Mỗi ngày: { date: "YYYY-MM-DD", count: N, minutes: M }
 */
async function generateHeatmap(userId) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 364);
  startDate.setHours(0, 0, 0, 0);

  // Aggregate study sessions theo ngày
  const pipeline = [
    {
      $match: {
        user_id: userId,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        count: { $sum: 1 },
        totalMinutes: { $sum: { $divide: ['$duration_seconds', 60] } },
      },
    },
    { $sort: { _id: 1 } },
  ];

  // user_id trong StudySession là ObjectId, cần convert string sang ObjectId
  // Sử dụng mongoose.Types.ObjectId nếu userId là string
  let sessions = [];
  try {
    const mongoose = (await import('mongoose')).default;
    const objectId =
      typeof userId === 'string'
        ? new mongoose.Types.ObjectId(userId)
        : userId;
    pipeline[0].$match.user_id = objectId;
    sessions = await StudySession.aggregate(pipeline);
  } catch {
    // Fallback: nếu aggregate thất bại, trả về mảng rỗng
    sessions = [];
  }

  // Tạo map cho quick lookup
  const sessionMap = new Map();
  sessions.forEach((s) => {
    sessionMap.set(s._id, {
      count: s.count,
      minutes: Math.round(s.totalMinutes || 0),
    });
  });

  // Tạo mảng 365 ngày
  const heatmap = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10);
    const data = sessionMap.get(dateStr);
    heatmap.push({
      date: dateStr,
      count: data?.count || 0,
      minutes: data?.minutes || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  return heatmap;
}

/**
 * Tạo weekly activity — 7 ngày gần nhất
 * Mỗi ngày: { day, label, studyMinutes, quizzes, flashcards, chats }
 */
async function generateWeeklyActivity(userId) {
  const days = [];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const sessions = await StudySession.find({
      user_id: userId,
      createdAt: { $gte: date, $lt: nextDate },
    }).lean();

    const dayData = {
      day: dayLabels[date.getDay()],
      date: date.toISOString().slice(0, 10),
      studyMinutes: 0,
      quizzes: 0,
      flashcards: 0,
      chats: 0,
    };

    sessions.forEach((s) => {
      dayData.studyMinutes += Math.round((s.duration_seconds || 0) / 60);
      if (s.session_type === 'quiz') dayData.quizzes++;
      if (s.session_type === 'flashcard') dayData.flashcards++;
      if (s.session_type === 'chat') dayData.chats++;
    });

    days.push(dayData);
  }

  return days;
}

/**
 * Tính phân bổ mastery levels từ concept_mastery
 * Returns: { mastered, learning, beginner, notStarted, total }
 */
function calculateMasteryOverview(progress) {
  const concepts = progress.concept_mastery || [];
  const total = concepts.length;

  if (total === 0) {
    return {
      mastered: 0,
      learning: 0,
      beginner: 0,
      notStarted: 0,
      total: 0,
      distribution: [],
    };
  }

  let mastered = 0;
  let learning = 0;
  let beginner = 0;

  concepts.forEach((c) => {
    const p = c.p_mastery || 0;
    if (p >= 0.8) mastered++;
    else if (p >= 0.4) learning++;
    else beginner++;
  });

  return {
    mastered,
    learning,
    beginner,
    notStarted: 0,
    total,
    masteryPercentage:
      total > 0 ? Math.round((mastered / total) * 100) : 0,
    distribution: [
      { label: 'Mastered', value: mastered, color: '#34d399' },
      { label: 'Learning', value: learning, color: '#818cf8' },
      { label: 'Beginner', value: beginner, color: '#fbbf24' },
    ],
  };
}

/**
 * Đếm số flashcards đã đến hạn review
 */
function countDueFlashcards(progress) {
  const now = new Date();
  const cards = progress.flashcard_states || [];
  return cards.filter(
    (c) => c.next_review_at && new Date(c.next_review_at) <= now
  ).length;
}

/**
 * GET /api/learning/profile-stats
 * Trả về stats chi tiết cho Profile v2 page:
 * - overview: tổng hợp số liệu chính
 * - streakInfo: streak hiện tại + longest
 * - masteryBreakdown: phân bổ mastery theo concept
 * - activityByType: phân tích hoạt động theo loại (quiz/flashcard/chat/reading)
 * - recentMilestones: các cột mốc đạt được
 * - joinDate: ngày tạo tài khoản
 */
router.get('/profile-stats', auth, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Lấy LearnerProgress
    let progress = await LearnerProgress.findOne({ user_id: userId });
    if (!progress) {
      progress = await LearnerProgress.create({ user_id: userId });
    }

    // Lấy User info (joinDate)
    const mongoose = (await import('mongoose')).default;
    const User = mongoose.model('User');
    const user = await User.findById(userId).lean();

    // ── 1. Overview stats ──
    const totalDocuments = await Document.countDocuments({
      user: userId,
      'metadata.processing_status': { $ne: 'failed' },
    });

    const overview = {
      totalDocuments,
      totalConcepts: progress.concept_mastery?.length || 0,
      totalStudyTimeSeconds: progress.stats?.total_study_time_seconds || 0,
      totalQuizzesTaken: progress.stats?.total_quizzes_taken || 0,
      totalFlashcardsReviewed: progress.stats?.total_flashcards_reviewed || 0,
      totalChatMessages: progress.stats?.total_chat_messages || 0,
      averageQuizScore: Math.round(progress.stats?.average_quiz_score || 0),
      dueFlashcards: countDueFlashcards(progress),
      totalFlashcardStates: progress.flashcard_states?.length || 0,
    };

    // ── 2. Streak info ──
    const streak = await calculateStreak(userId, progress);

    // ── 3. Mastery breakdown ──
    const concepts = progress.concept_mastery || [];
    const masteryBreakdown = {
      mastered: 0,
      learning: 0,
      beginner: 0,
      total: concepts.length,
      topConcepts: [],
    };

    concepts.forEach((c) => {
      const p = c.p_mastery || 0;
      if (p >= 0.8) masteryBreakdown.mastered++;
      else if (p >= 0.4) masteryBreakdown.learning++;
      else masteryBreakdown.beginner++;
    });

    // Top 5 concepts theo mastery
    const sorted = [...concepts]
      .sort((a, b) => (b.p_mastery || 0) - (a.p_mastery || 0))
      .slice(0, 5);
    masteryBreakdown.topConcepts = sorted.map((c) => ({
      name: c.concept,
      mastery: Math.round((c.p_mastery || 0) * 100),
      attempts: c.attempts || 0,
    }));

    // ── 4. Activity by type (từ StudySession) ──
    const objectId =
      typeof userId === 'string'
        ? new mongoose.Types.ObjectId(userId)
        : userId;

    let activityByType = { quiz: 0, flashcard: 0, chat: 0, reading: 0 };
    try {
      const typeAgg = await StudySession.aggregate([
        { $match: { user_id: objectId } },
        { $group: { _id: '$session_type', count: { $sum: 1 }, totalSeconds: { $sum: '$duration_seconds' } } },
      ]);
      typeAgg.forEach((t) => {
        activityByType[t._id] = {
          count: t.count,
          totalMinutes: Math.round((t.totalSeconds || 0) / 60),
        };
      });
    } catch {
      // fallback — giữ default
    }

    // ── 5. Recent milestones (tính từ stats) ──
    const milestones = [];
    const totalStudyHours = Math.floor((overview.totalStudyTimeSeconds || 0) / 3600);

    if (totalStudyHours >= 1) milestones.push({ icon: '⏱️', label: `${totalStudyHours}h study time`, achieved: true });
    if (overview.totalDocuments >= 1) milestones.push({ icon: '📄', label: `${overview.totalDocuments} documents uploaded`, achieved: true });
    if (overview.totalQuizzesTaken >= 1) milestones.push({ icon: '🧪', label: `${overview.totalQuizzesTaken} quizzes completed`, achieved: true });
    if (overview.totalFlashcardsReviewed >= 10) milestones.push({ icon: '🃏', label: `${overview.totalFlashcardsReviewed} flashcards reviewed`, achieved: true });
    if (masteryBreakdown.mastered >= 1) milestones.push({ icon: '🏆', label: `${masteryBreakdown.mastered} concepts mastered`, achieved: true });
    if (streak.current >= 3) milestones.push({ icon: '🔥', label: `${streak.current}-day streak`, achieved: true });
    if (streak.longest >= 7) milestones.push({ icon: '⭐', label: `${streak.longest}-day longest streak`, achieved: true });

    // Thêm milestones chưa đạt
    if (totalStudyHours < 10) milestones.push({ icon: '🎯', label: '10h study time', achieved: false });
    if (overview.totalQuizzesTaken < 10) milestones.push({ icon: '📝', label: '10 quizzes completed', achieved: false });
    if (masteryBreakdown.mastered < 10) milestones.push({ icon: '💎', label: '10 concepts mastered', achieved: false });

    res.json({
      overview,
      streak,
      masteryBreakdown,
      activityByType,
      milestones: milestones.slice(0, 8), // max 8
      joinDate: user?.createdAt || null,
      neuralProfile: user?.neural_profile || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/learning/export-data
 * Export toàn bộ dữ liệu học tập của user dạng JSON
 * Hỗ trợ query param: ?format=json (mặc định)
 */
router.get('/export-data', auth, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Lấy user info
    const mongoose = (await import('mongoose')).default;
    const User = mongoose.model('User');
    const user = await User.findById(userId).lean();
    delete user?.password_hash;
    delete user?.refresh_token;

    // Lấy LearnerProgress
    const progress = await LearnerProgress.findOne({ user_id: userId }).lean();

    // Lấy tất cả StudySessions
    const sessions = await StudySession.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .populate('document_id', 'title')
      .lean();

    // Lấy tất cả Documents
    const documents = await Document.find({ user: userId })
      .select('title original_filename metadata.file_type metadata.file_size metadata.processing_status createdAt')
      .lean();

    const exportData = {
      exportedAt: new Date().toISOString(),
      platform: 'NeuroVault',
      version: '2.0',
      user: {
        name: user?.name,
        email: user?.email,
        role: user?.role,
        joinDate: user?.createdAt,
        neuralProfile: user?.neural_profile,
      },
      learningProgress: {
        streak: progress?.streak || { current: 0, longest: 0 },
        stats: progress?.stats || {},
        conceptMastery: (progress?.concept_mastery || []).map((c) => ({
          concept: c.concept,
          mastery: Math.round((c.p_mastery || 0) * 100),
          attempts: c.attempts || 0,
          correct: c.correct || 0,
        })),
        flashcardStates: (progress?.flashcard_states || []).map((f) => ({
          front: f.front,
          back: f.back,
          stability: f.stability,
          difficulty: f.difficulty,
          reviewCount: f.review_count,
          nextReview: f.next_review_at,
        })),
      },
      studySessions: sessions.map((s) => ({
        type: s.session_type,
        document: s.document_id?.title || 'Unknown',
        duration: s.duration_seconds,
        date: s.createdAt,
        quizResults: s.quiz_results || null,
        flashcardResults: s.flashcard_results || null,
      })),
      documents: documents.map((d) => ({
        title: d.title,
        filename: d.original_filename,
        type: d.metadata?.file_type,
        size: d.metadata?.file_size,
        status: d.metadata?.processing_status,
        uploadDate: d.createdAt,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="neurovault-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json(exportData);
  } catch (err) {
    next(err);
  }
});

export default router;
