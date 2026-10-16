import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema({
  chunk_id: { type: String, required: true },
  text: { type: String, required: true },
  embedding_vector: { type: [Number], default: [] },
  sparse_vector: { type: mongoose.Schema.Types.Mixed, default: {} },
  concepts: { type: [String], default: [] },
  position: { type: Number, required: true },
  char_start: { type: Number, default: 0 },
  char_end: { type: Number, default: 0 },
  sentence_count: { type: Number, default: 0 },
  word_count: { type: Number, default: 0 },
}, { _id: false });

const documentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Document title is required'],
    trim: true,
    maxlength: 500,
  },
  original_filename: { type: String, default: '' },
  file_path: { type: String, default: '' },
  file_size: { type: Number, default: 0 },
  mime_type: { type: String, default: '' },
  raw_text: { type: String, default: '' },
  language: {
    type: String,
    enum: ['vi', 'en', 'mixed', 'unknown'],
    default: 'unknown',
  },
  chunks: [chunkSchema],
  metadata: {
    word_count: { type: Number, default: 0 },
    page_count: { type: Number, default: 0 },
    char_count: { type: Number, default: 0 },
    chunk_count: { type: Number, default: 0 },
    processing_status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    processing_error: { type: String, default: '' },
    processing_started_at: { type: Date, default: null },
    processing_completed_at: { type: Date, default: null },
  },
}, {
  timestamps: true,
});

// Index cho query hiệu suất
documentSchema.index({ user_id: 1, createdAt: -1 });
documentSchema.index({ 'metadata.processing_status': 1 });

const Document = mongoose.model('Document', documentSchema);
export default Document;
