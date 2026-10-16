/**
 * NEUROVAULT — Notification Service
 * Centralized notification creation + event emission.
 * Used by gamification hooks, streak checks, reminders.
 */
import Notification from '../models/Notification.model.js';
import { EventEmitter } from 'events';

// Global event bus for real-time push
export const notificationBus = new EventEmitter();
notificationBus.setMaxListeners(100);

/**
 * Create and emit a notification
 * @returns {object} created notification document
 */
export async function createNotification(userId, { type, title, message, icon, actionUrl, metadata }) {
  const notif = await Notification.create({
    user_id: userId,
    type: type || 'system',
    title,
    message: message || '',
    icon: icon || getDefaultIcon(type),
    actionUrl: actionUrl || '',
    metadata: metadata || {},
  });

  // Emit for real-time push via SSE/WS
  notificationBus.emit('notification', { userId: userId.toString(), notification: notif.toObject() });

  return notif;
}

/**
 * Batch-create notifications for common events
 */
export const NotificationTemplates = {
  levelUp: (userId, level, tier) => createNotification(userId, {
    type: 'level_up', title: `Level Up! You're now Level ${level}`,
    message: `Welcome to ${tier} tier. Keep learning to unlock more rewards!`,
    icon: '⬆️', actionUrl: '/dashboard',
  }),

  badgeEarned: (userId, badgeName, badgeIcon) => createNotification(userId, {
    type: 'achievement', title: `Badge Earned: ${badgeName}`,
    message: `You've unlocked the ${badgeName} achievement!`,
    icon: badgeIcon || '🏅', actionUrl: '/profile',
  }),

  streakMilestone: (userId, days) => createNotification(userId, {
    type: 'streak', title: `${days}-Day Streak! 🔥`,
    message: `You've maintained a ${days}-day learning streak. Amazing dedication!`,
    icon: '🔥', actionUrl: '/dashboard',
  }),

  dailyChallengeComplete: (userId, challengeTitle, xpReward) => createNotification(userId, {
    type: 'challenge', title: `Challenge Complete: ${challengeTitle}`,
    message: `You earned +${xpReward} XP from today's challenge!`,
    icon: '🎯', actionUrl: '/dashboard',
  }),

  quizComplete: (userId, score, documentTitle) => createNotification(userId, {
    type: 'quiz', title: `Quiz Complete: ${score}%`,
    message: `You scored ${score}% on "${documentTitle || 'a quiz'}".`,
    icon: score >= 80 ? '🌟' : '📝', actionUrl: '/dashboard',
  }),

  flashcardReminder: (userId, dueCount) => createNotification(userId, {
    type: 'reminder', title: `${dueCount} flashcards due for review`,
    message: 'Spaced repetition works best when you review on time!',
    icon: '🃏', actionUrl: '/dashboard',
  }),

  masteryDropAlert: (userId, conceptName, dropPercent) => createNotification(userId, {
    type: 'alert', title: `📉 Mastery dropped: ${conceptName}`,
    message: `Your understanding decreased by ${dropPercent}%. Review to maintain your knowledge.`,
    icon: '📉', actionUrl: '/dashboard',
    metadata: { concept: conceptName, drop: dropPercent },
  }),

  smartReviewReminder: (userId, dueCount, overdueCount) => createNotification(userId, {
    type: 'reminder', title: overdueCount > 0
      ? `⚠️ ${overdueCount} overdue + ${dueCount - overdueCount} due cards`
      : `📚 ${dueCount} flashcards ready for review`,
    message: overdueCount > 0
      ? 'Some cards are significantly overdue. Review now to prevent forgetting!'
      : 'Keep your spaced repetition schedule on track.',
    icon: overdueCount > 0 ? '⚠️' : '📚', actionUrl: '/dashboard',
    metadata: { dueCount, overdueCount },
  }),

  inactivityWarning: (userId, daysInactive) => createNotification(userId, {
    type: 'reminder', title: `💪 ${daysInactive} days since last session`,
    message: 'Even a quick 5-minute review helps maintain your knowledge. Start small!',
    icon: '💪', actionUrl: '/dashboard',
    metadata: { daysInactive },
  }),

  weeklyDigest: (userId, digest) => createNotification(userId, {
    type: 'digest', title: '📊 Your Weekly Learning Digest',
    message: `${digest.study_time_minutes}min studied · ${digest.concepts_mastered} concepts mastered · ${digest.streak_days}-day streak`,
    icon: '📊', actionUrl: '/dashboard',
    metadata: digest,
  }),

  welcome: (userId) => createNotification(userId, {
    type: 'system', title: 'Welcome to NeuroVault! 🧠',
    message: 'Start by uploading a document to begin your AI-powered learning journey.',
    icon: '👋', actionUrl: '/documents',
  }),
};

function getDefaultIcon(type) {
  const icons = {
    system: '🔔', achievement: '🏅', streak: '🔥', quiz: '📝',
    flashcard: '🃏', social: '👥', reminder: '⏰', level_up: '⬆️', challenge: '🎯',
    alert: '⚠️', digest: '📊',
  };
  return icons[type] || '🔔';
}
