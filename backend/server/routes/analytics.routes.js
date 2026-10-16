import { Router } from 'express';
import auth from '../middleware/auth.js';
import { cacheResponse } from '../middleware/responseCache.js';
import StudySession from '../models/StudySession.model.js';
import LearnerProgress from '../models/LearnerProgress.model.js';
import Document from '../models/Document.model.js';
import Gamification from '../models/Gamification.model.js';

const router = Router();

/**
 * GET /api/analytics/overview
 * Tổng quan analytics: study time trends, quiz performance, concept mastery,
 * session distribution, predictions, comparative stats.
 * Query params: ?range=7|14|30|90 (days, default 30)
 * Cached for 5 minutes per user (expensive aggregation).
 */
router.get('/overview', auth, cacheResponse(300), async (req, res, next) => {
  try {
    const userId = req.userId;
    const range = Math.min(parseInt(req.query.range) || 30, 90);

    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - range);
    rangeStart.setHours(0, 0, 0, 0);

    // ══════════════════════════════════════════════
    // 1. Session data in range
    // ══════════════════════════════════════════════
    const sessions = await StudySession.find({
      user_id: userId,
      createdAt: { $gte: rangeStart },
    }).sort({ createdAt: 1 }).lean();

    // ══════════════════════════════════════════════
    // 2. Study Time Trend (daily aggregation)
    // ══════════════════════════════════════════════
    const studyTimeTrend = [];
    const dailyMap = {};

    // Init all dates in range
    for (let i = 0; i < range; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (range - 1 - i));
      const dateStr = d.toISOString().slice(0, 10);
      dailyMap[dateStr] = {
        date: dateStr,
        studyMinutes: 0,
        sessions: 0,
        quizzes: 0,
        flashcards: 0,
        chats: 0,
        reading: 0,
      };
    }

    sessions.forEach(s => {
      const dateStr = new Date(s.createdAt).toISOString().slice(0, 10);
      if (dailyMap[dateStr]) {
        dailyMap[dateStr].studyMinutes += Math.round((s.duration_seconds || 0) / 60);
        dailyMap[dateStr].sessions += 1;
        if (s.session_type === 'quiz') dailyMap[dateStr].quizzes += 1;
        if (s.session_type === 'flashcard') dailyMap[dateStr].flashcards += 1;
        if (s.session_type === 'chat') dailyMap[dateStr].chats += 1;
        if (s.session_type === 'reading') dailyMap[dateStr].reading += 1;
      }
    });

    Object.values(dailyMap).forEach(d => studyTimeTrend.push(d));

    // ══════════════════════════════════════════════
    // 3. Quiz Performance Trend
    // ══════════════════════════════════════════════
    const quizSessions = sessions.filter(s => s.session_type === 'quiz' && s.quiz_results);
    const quizPerformance = quizSessions.map(s => ({
      date: new Date(s.createdAt).toISOString().slice(0, 10),
      score: s.quiz_results.score_percentage || 0,
      totalQuestions: s.quiz_results.total_questions || 0,
      correctAnswers: s.quiz_results.correct_answers || 0,
    }));

    // Quiz average (overall)
    const avgQuizScore = quizSessions.length > 0
      ? Math.round(quizSessions.reduce((sum, s) => sum + (s.quiz_results.score_percentage || 0), 0) / quizSessions.length)
      : 0;

    // Quiz average trend (weekly buckets)
    const quizWeeklyTrend = [];
    const weekSize = 7;
    for (let i = 0; i < Math.ceil(range / weekSize); i++) {
      const weekStart = new Date(rangeStart);
      weekStart.setDate(weekStart.getDate() + i * weekSize);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + weekSize);

      const weekQuizzes = quizSessions.filter(s => {
        const d = new Date(s.createdAt);
        return d >= weekStart && d < weekEnd;
      });

      if (weekQuizzes.length > 0) {
        const avg = Math.round(weekQuizzes.reduce((sum, s) =>
          sum + (s.quiz_results.score_percentage || 0), 0) / weekQuizzes.length);
        quizWeeklyTrend.push({
          weekLabel: `W${i + 1}`,
          weekStart: weekStart.toISOString().slice(0, 10),
          average: avg,
          count: weekQuizzes.length,
        });
      }
    }

    // ══════════════════════════════════════════════
    // 4. Session Type Distribution — single-pass (was 8 filter iterations)
    // ══════════════════════════════════════════════
    const typeDistribution = { quiz: 0, flashcard: 0, chat: 0, reading: 0 };
    const timeDistribution = { quiz: 0, flashcard: 0, chat: 0, reading: 0 };

    sessions.forEach(s => {
      const t = s.session_type;
      if (typeDistribution[t] !== undefined) {
        typeDistribution[t]++;
        timeDistribution[t] += Math.round((s.duration_seconds || 0) / 60);
      }
    });

    // ══════════════════════════════════════════════
    // 5. Concept Mastery Progress
    // ══════════════════════════════════════════════
    const progress = await LearnerProgress.findOne({ user_id: userId }).lean();
    const concepts = progress?.concept_mastery || [];

    const conceptStats = {
      total: concepts.length,
      mastered: concepts.filter(c => c.p_mastery >= 0.8).length,
      learning: concepts.filter(c => c.p_mastery >= 0.4 && c.p_mastery < 0.8).length,
      beginner: concepts.filter(c => c.p_mastery < 0.4).length,
    };

    // Top 10 strongest + weakest concepts
    const sortedConcepts = [...concepts].sort((a, b) => b.p_mastery - a.p_mastery);
    const strongConcepts = sortedConcepts.slice(0, 10).map(c => ({
      concept: c.concept,
      mastery: Math.round(c.p_mastery * 100),
      attempts: c.attempts,
    }));
    const weakConcepts = sortedConcepts.slice(-10).reverse().map(c => ({
      concept: c.concept,
      mastery: Math.round(c.p_mastery * 100),
      attempts: c.attempts,
    }));

    // ══════════════════════════════════════════════
    // 6. Flashcard Analysis
    // ══════════════════════════════════════════════
    const flashcardSessions = sessions.filter(s => s.session_type === 'flashcard' && s.flashcard_results);
    const flashcardStats = {
      totalReviewed: flashcardSessions.reduce((sum, s) =>
        sum + (s.flashcard_results.cards_reviewed || 0), 0),
      ratingDistribution: {
        again: flashcardSessions.reduce((sum, s) => sum + (s.flashcard_results.ratings?.again || 0), 0),
        hard: flashcardSessions.reduce((sum, s) => sum + (s.flashcard_results.ratings?.hard || 0), 0),
        good: flashcardSessions.reduce((sum, s) => sum + (s.flashcard_results.ratings?.good || 0), 0),
        easy: flashcardSessions.reduce((sum, s) => sum + (s.flashcard_results.ratings?.easy || 0), 0),
      },
      dueCards: 0,
    };

    // Count due flashcards
    if (progress?.flashcard_states) {
      const now = new Date();
      flashcardStats.dueCards = progress.flashcard_states.filter(
        c => !c.next_review_at || new Date(c.next_review_at) <= now
      ).length;
    }

    // ══════════════════════════════════════════════
    // 7. Study Patterns (peak hours, day-of-week)
    // ══════════════════════════════════════════════
    const hourDistribution = new Array(24).fill(0);
    const dayDistribution = new Array(7).fill(0);
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    sessions.forEach(s => {
      const d = new Date(s.createdAt);
      hourDistribution[d.getHours()] += 1;
      dayDistribution[d.getDay()] += 1;
    });

    const peakHour = hourDistribution.indexOf(Math.max(...hourDistribution));
    const peakDay = dayLabels[dayDistribution.indexOf(Math.max(...dayDistribution))];

    // ══════════════════════════════════════════════
    // 8. Prediction: Expected mastery in 7 days
    // ══════════════════════════════════════════════
    // Simple linear extrapolation from current trend
    const recentWeekSessions = sessions.filter(s => {
      const d = new Date(s.createdAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    });

    const avgDailyMinutes = recentWeekSessions.length > 0
      ? Math.round(recentWeekSessions.reduce((sum, s) =>
          sum + (s.duration_seconds || 0), 0) / 60 / 7)
      : 0;

    const prediction = {
      avgDailyMinutes,
      expectedWeeklyMinutes: avgDailyMinutes * 7,
      studyConsistency: Math.round(
        (studyTimeTrend.filter(d => d.sessions > 0).length / range) * 100
      ),
      // Predicted concepts to master: current learning rate * 7 days
      conceptsPerDay: range > 0
        ? Math.round((conceptStats.mastered / Math.max(range, 1)) * 100) / 100
        : 0,
    };
    prediction.predictedNewMastery = Math.round(prediction.conceptsPerDay * 7);

    // ══════════════════════════════════════════════
    // 9. Summary Stats
    // ══════════════════════════════════════════════
    const totalMinutes = sessions.reduce((sum, s) => sum + Math.round((s.duration_seconds || 0) / 60), 0);
    const totalSessions = sessions.length;

    const summaryStats = {
      totalMinutes,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      totalSessions,
      avgSessionMinutes: totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0,
      activeDays: studyTimeTrend.filter(d => d.sessions > 0).length,
      totalDays: range,
      avgQuizScore,
      totalQuizzes: quizSessions.length,
      totalFlashcardsReviewed: flashcardStats.totalReviewed,
    };

    // ══════════════════════════════════════════════
    // 10. Gamification summary
    // ══════════════════════════════════════════════
    let gamSummary = null;
    try {
      const gamProfile = await Gamification.findOne({ user_id: userId }).lean();
      if (gamProfile) {
        gamSummary = {
          xp: gamProfile.xp,
          level: gamProfile.level,
          tier: gamProfile.tier,
          badges: gamProfile.badges?.length || 0,
        };
      }
    } catch { /* non-critical */ }

    res.json({
      range,
      summaryStats,
      studyTimeTrend,
      quizPerformance,
      quizWeeklyTrend,
      typeDistribution,
      timeDistribution,
      conceptStats,
      strongConcepts,
      weakConcepts,
      flashcardStats,
      studyPatterns: {
        hourDistribution,
        dayDistribution,
        dayLabels,
        peakHour,
        peakDay,
      },
      prediction,
      gamification: gamSummary,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/concepts
 * Detailed concept mastery list with search/sort
 * Query: ?sort=mastery|attempts|recent&search=keyword
 */
router.get('/concepts', auth, async (req, res, next) => {
  try {
    const progress = await LearnerProgress.findOne({ user_id: req.userId }).lean();
    let concepts = progress?.concept_mastery || [];
    const { sort = 'mastery', search = '' } = req.query;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      concepts = concepts.filter(c => c.concept.toLowerCase().includes(q));
    }

    // Sort
    if (sort === 'mastery') {
      concepts.sort((a, b) => b.p_mastery - a.p_mastery);
    } else if (sort === 'attempts') {
      concepts.sort((a, b) => b.attempts - a.attempts);
    } else if (sort === 'recent') {
      concepts.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
    }

    const result = concepts.map(c => ({
      concept: c.concept,
      mastery: Math.round(c.p_mastery * 100),
      attempts: c.attempts,
      correct: c.correct,
      accuracy: c.attempts > 0 ? Math.round((c.correct / c.attempts) * 100) : 0,
      lastUpdated: c.last_updated,
    }));

    res.json({
      total: result.length,
      concepts: result,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
