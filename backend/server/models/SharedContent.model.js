import mongoose from 'mongoose';

/**
 * NEUROVAULT — SharedContent Model
 * Community content library: published documents, ratings, tags.
 */
const sharedContentSchema = new mongoose.Schema({
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
  },
  author_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: { type: String, required: true, trim: true, maxlength: 500 },
  description: { type: String, default: '', maxlength: 1000 },
  subject: {
    type: String,
    enum: ['cs', 'math', 'science', 'language', 'history', 'business', 'art', 'other'],
    default: 'other',
  },
  tags: [{ type: String, trim: true, lowercase: true }],
  language: { type: String, enum: ['vi', 'en', 'mixed'], default: 'en' },

  // Stats
  views: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  liked_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Ratings (1-5)
  ratings: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: { type: Number, min: 1, max: 5 },
    createdAt: { type: Date, default: Date.now },
  }],
  average_rating: { type: Number, default: 0 },
  rating_count: { type: Number, default: 0 },

  // Content snapshot (no raw_text/chunks — just metadata)
  content_preview: { type: String, default: '', maxlength: 500 },
  word_count: { type: Number, default: 0 },
  concept_count: { type: Number, default: 0 },

  // Moderation
  status: {
    type: String,
    enum: ['published', 'under_review', 'removed'],
    default: 'published',
  },
  featured: { type: Boolean, default: false },
}, {
  timestamps: true,
});

sharedContentSchema.index({ status: 1, createdAt: -1 });
sharedContentSchema.index({ subject: 1, average_rating: -1 });
sharedContentSchema.index({ tags: 1 });
sharedContentSchema.index({ author_id: 1 });
sharedContentSchema.index({ title: 'text', description: 'text', tags: 'text' });

const SharedContent = mongoose.model('SharedContent', sharedContentSchema);
export default SharedContent;
