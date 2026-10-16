import mongoose from 'mongoose';

/**
 * NEUROVAULT — Notification Model
 * Persistent notifications per user.
 * Categories: system, achievement, streak, quiz, flashcard, social, reminder
 */
const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['system', 'achievement', 'streak', 'quiz', 'flashcard', 'social', 'reminder', 'level_up', 'challenge', 'alert', 'digest'],
    default: 'system',
  },
  title: {
    type: String,
    required: true,
    maxlength: 120,
  },
  message: {
    type: String,
    default: '',
    maxlength: 500,
  },
  icon: {
    type: String,
    default: '🔔',
  },
  read: {
    type: Boolean,
    default: false,
  },
  actionUrl: {
    type: String,
    default: '',
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

notificationSchema.index({ user_id: 1, createdAt: -1 });
notificationSchema.index({ user_id: 1, read: 1 });

// Auto-delete notifications older than 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
