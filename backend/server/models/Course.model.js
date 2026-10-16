import mongoose from 'mongoose';

/**
 * NEUROVAULT — Course Model
 * Instructor-created courses with modules, materials, and enrollment tracking.
 */

const moduleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    default: '',
    maxlength: 1000,
  },
  order: {
    type: Number,
    required: true,
    min: 0,
  },
  // Linked documents (study materials)
  document_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
  }],
  // Module completion criteria
  requirements: {
    min_quiz_score: { type: Number, default: 0, min: 0, max: 100 },
    min_flashcard_reviews: { type: Number, default: 0 },
    min_study_minutes: { type: Number, default: 0 },
  },
  is_published: { type: Boolean, default: false },
}, { _id: true });

const enrollmentSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  enrolled_at: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['active', 'completed', 'dropped'],
    default: 'active',
  },
  progress: {
    completed_modules: [{ type: mongoose.Schema.Types.ObjectId }],
    current_module_index: { type: Number, default: 0 },
    overall_percent: { type: Number, default: 0, min: 0, max: 100 },
    last_activity_at: { type: Date, default: Date.now },
  },
  // Student performance in this course
  grade: {
    quiz_average: { type: Number, default: 0 },
    flashcard_mastery: { type: Number, default: 0 },
    total_study_minutes: { type: Number, default: 0 },
    final_grade: { type: String, default: '' },
  },
}, { _id: true });

const courseSchema = new mongoose.Schema({
  instructor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    default: '',
    maxlength: 2000,
  },
  subject: {
    type: String,
    enum: ['cs', 'math', 'science', 'language', 'history', 'business', 'art', 'other'],
    default: 'other',
  },
  thumbnail: {
    type: String,
    default: '',
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'all'],
    default: 'all',
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  },
  modules: [moduleSchema],
  enrollments: [enrollmentSchema],
  // Course settings
  settings: {
    max_students: { type: Number, default: 100 },
    enrollment_open: { type: Boolean, default: true },
    require_approval: { type: Boolean, default: false },
    allow_self_paced: { type: Boolean, default: true },
  },
  // Aggregated stats
  stats: {
    total_enrolled: { type: Number, default: 0 },
    total_completed: { type: Number, default: 0 },
    average_completion_rate: { type: Number, default: 0 },
    average_quiz_score: { type: Number, default: 0 },
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true,
  }],
}, {
  timestamps: true,
});

// Indexes
courseSchema.index({ instructor_id: 1, createdAt: -1 });
courseSchema.index({ status: 1, subject: 1 });
courseSchema.index({ 'enrollments.student_id': 1 });
courseSchema.index({ title: 'text', description: 'text', tags: 'text' });

const Course = mongoose.model('Course', courseSchema);
export default Course;
