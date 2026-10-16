import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  question_text: { type: String, required: true },
  question_type: {
    type: String,
    enum: ['mcq', 'fill_blank', 'true_false', 'socratic'],
    required: true,
  },
  correct_answer: { type: String, required: true },
  distractors: { type: [String], default: [] },
  source_concept_id: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeNode' },
  user_answer: { type: String, default: '' },
  is_correct: { type: Boolean, default: null },
  time_taken_ms: { type: Number, default: 0 },
  difficulty: { type: Number, default: 0.5, min: 0, max: 1 },
}, { _id: true });

const quizSessionSchema = new mongoose.Schema({
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
  questions: [questionSchema],
  score: { type: Number, default: 0 },
  total_questions: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0, min: 0, max: 1 },
  total_time_ms: { type: Number, default: 0 },
  cognitive_load_estimate: { type: Number, default: 0, min: 0, max: 1 },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'abandoned'],
    default: 'in_progress',
  },
}, {
  timestamps: true,
});

quizSessionSchema.index({ user_id: 1, createdAt: -1 });

const QuizSession = mongoose.model('QuizSession', quizSessionSchema);
export default QuizSession;
