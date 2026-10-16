import mongoose from 'mongoose';

const learnerProgressSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // FSRS card states
  flashcard_states: [{
    card_id: String,
    document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    front: String,
    back: String,
    stability: { type: Number, default: 1.0 },
    difficulty: { type: Number, default: 5.0 },
    elapsed_days: { type: Number, default: 0 },
    review_count: { type: Number, default: 0 },
    next_review_at: { type: Date, default: null },
    last_reviewed_at: { type: Date, default: null },
    rating_history: [{ type: Number }], // 1-4
  }],
  // BKT mastery per concept
  concept_mastery: [{
    concept: String,
    document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    p_mastery: { type: Number, default: 0.3 },
    attempts: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    last_updated: { type: Date, default: Date.now },
  }],
  // Streak tracking
  streak: {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    last_study_date: { type: String, default: '' },  // YYYY-MM-DD
  },
  // Aggregated stats
  stats: {
    total_study_time_seconds: { type: Number, default: 0 },
    total_quizzes_taken: { type: Number, default: 0 },
    total_flashcards_reviewed: { type: Number, default: 0 },
    total_chat_messages: { type: Number, default: 0 },
    average_quiz_score: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

learnerProgressSchema.index({ user_id: 1 }, { unique: true });

const LearnerProgress = mongoose.model('LearnerProgress', learnerProgressSchema);
export default LearnerProgress;
