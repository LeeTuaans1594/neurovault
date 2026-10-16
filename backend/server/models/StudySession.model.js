import mongoose from 'mongoose';

const studySessionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
  },
  session_type: {
    type: String,
    enum: ['quiz', 'flashcard', 'chat', 'reading'],
    required: true,
  },
  started_at: { type: Date, default: Date.now },
  ended_at: { type: Date, default: null },
  duration_seconds: { type: Number, default: 0 },
  
  // Quiz-specific
  quiz_results: {
    total_questions: { type: Number, default: 0 },
    correct_answers: { type: Number, default: 0 },
    score_percentage: { type: Number, default: 0 },
    questions: [{
      question_text: String,
      user_answer: String,
      correct_answer: String,
      is_correct: Boolean,
      time_spent_seconds: Number,
    }],
  },

  // Flashcard-specific
  flashcard_results: {
    total_cards: { type: Number, default: 0 },
    cards_reviewed: { type: Number, default: 0 },
    ratings: {
      again: { type: Number, default: 0 },
      hard: { type: Number, default: 0 },
      good: { type: Number, default: 0 },
      easy: { type: Number, default: 0 },
    },
  },

  // Concepts covered
  concepts_covered: [{ type: String }],
}, {
  timestamps: true,
});

studySessionSchema.index({ user_id: 1, createdAt: -1 });
studySessionSchema.index({ user_id: 1, session_type: 1 });

const StudySession = mongoose.model('StudySession', studySessionSchema);
export default StudySession;
