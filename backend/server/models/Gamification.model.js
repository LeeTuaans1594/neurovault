import mongoose from 'mongoose';

/**
 * NEUROVAULT — Gamification Model
 * Quản lý XP, levels, badges, daily challenges cho mỗi learner.
 * 
 * XP Formula: level = floor(sqrt(xp / 100))
 * Tiers: Bronze(1-5), Silver(6-10), Gold(11-15), Platinum(16-20), Diamond(21+)
 */

const badgeSchema = new mongoose.Schema({
  badge_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: '🏅',
  },
  category: {
    type: String,
    enum: ['documents', 'quizzes', 'flashcards', 'streaks', 'engagement', 'mastery', 'special'],
    default: 'special',
  },
  earned_at: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const dailyChallengeSchema = new mongoose.Schema({
  date: {
    type: String,  // YYYY-MM-DD
    required: true,
  },
  challenge_type: {
    type: String,
    enum: ['quiz_score', 'flashcard_count', 'study_time', 'chat_count', 'upload_doc'],
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  target: {
    type: Number,
    required: true,
  },
  progress: {
    type: Number,
    default: 0,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  completed_at: {
    type: Date,
    default: null,
  },
  xp_reward: {
    type: Number,
    default: 100,
  },
}, { _id: false });

const xpLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const gamificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Total XP
  xp: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Computed level
  level: {
    type: Number,
    default: 0,
  },
  // Tier label
  tier: {
    type: String,
    enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
    default: 'Bronze',
  },
  // Earned badges
  badges: [badgeSchema],
  // Daily challenges (keep last 7 days)
  daily_challenges: [dailyChallengeSchema],
  // XP log (keep last 50 entries for history)
  xp_log: [xpLogSchema],
  // Lifetime counters for badge progress
  lifetime: {
    documents_uploaded: { type: Number, default: 0 },
    quizzes_completed: { type: Number, default: 0 },
    flashcards_reviewed: { type: Number, default: 0 },
    chat_messages: { type: Number, default: 0 },
    concepts_mastered: { type: Number, default: 0 },
    total_study_minutes: { type: Number, default: 0 },
    perfect_quizzes: { type: Number, default: 0 },  // 100% score
    login_days: { type: Number, default: 0 },
  },
  // Last daily login date (for login streak XP)
  last_login_date: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

// Unique per user
gamificationSchema.index({ user_id: 1 }, { unique: true });
// For leaderboard queries
gamificationSchema.index({ xp: -1 });

// ── Static Methods ──

/**
 * Calculate level from XP
 * Formula: level = floor(sqrt(xp / 100))
 */
gamificationSchema.statics.calculateLevel = function (xp) {
  return Math.floor(Math.sqrt(xp / 100));
};

/**
 * Calculate tier from level
 */
gamificationSchema.statics.calculateTier = function (level) {
  if (level >= 21) return 'Diamond';
  if (level >= 16) return 'Platinum';
  if (level >= 11) return 'Gold';
  if (level >= 6) return 'Silver';
  return 'Bronze';
};

/**
 * Calculate XP needed for next level
 */
gamificationSchema.statics.xpForLevel = function (level) {
  return level * level * 100;
};

/**
 * Calculate progress to next level (0.0 - 1.0)
 */
gamificationSchema.statics.progressToNextLevel = function (xp) {
  const currentLevel = Math.floor(Math.sqrt(xp / 100));
  const currentLevelXP = currentLevel * currentLevel * 100;
  const nextLevelXP = (currentLevel + 1) * (currentLevel + 1) * 100;
  const progress = (xp - currentLevelXP) / (nextLevelXP - currentLevelXP);
  return Math.min(Math.max(progress, 0), 1);
};

// ── Instance Methods ──

/**
 * Award XP and update level/tier
 */
gamificationSchema.methods.awardXP = function (amount, action, description = '') {
  if (amount <= 0) return { xpGained: 0, leveledUp: false };

  const oldLevel = this.level;
  this.xp += amount;
  this.level = this.constructor.calculateLevel(this.xp);
  this.tier = this.constructor.calculateTier(this.level);

  // Log XP (keep last 50)
  this.xp_log.push({ action, amount, description });
  if (this.xp_log.length > 50) {
    this.xp_log = this.xp_log.slice(-50);
  }

  const leveledUp = this.level > oldLevel;
  return {
    xpGained: amount,
    leveledUp,
    newLevel: this.level,
    newTier: this.tier,
    totalXP: this.xp,
  };
};

/**
 * Check and award badge if not already earned
 */
gamificationSchema.methods.tryAwardBadge = function (badgeDef) {
  const alreadyHas = this.badges.some(b => b.badge_id === badgeDef.badge_id);
  if (alreadyHas) return null;

  this.badges.push({
    badge_id: badgeDef.badge_id,
    name: badgeDef.name,
    description: badgeDef.description,
    icon: badgeDef.icon,
    category: badgeDef.category,
    earned_at: new Date(),
  });

  return badgeDef;
};

const Gamification = mongoose.model('Gamification', gamificationSchema);
export default Gamification;
