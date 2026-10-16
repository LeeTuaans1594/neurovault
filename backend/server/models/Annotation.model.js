import mongoose from 'mongoose';

/**
 * NEUROVAULT — Annotation Model
 * Lưu trữ annotations (highlight, note, bookmark) trên tài liệu.
 * Annotations lưu riêng biệt, KHÔNG thay đổi file gốc.
 * Sử dụng normalized coordinates (0-1) để scale-independent.
 */
const annotationSchema = new mongoose.Schema({
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
    index: true,
  },
  type: {
    type: String,
    enum: ['highlight', 'note', 'bookmark'],
    required: true,
  },
  // Vị trí trong text (char-based) — cho TXT/MD content
  text_selection: {
    start_offset: { type: Number, default: 0 },
    end_offset: { type: Number, default: 0 },
    selected_text: { type: String, default: '' },
  },
  // Chunk reference — annotation gắn với chunk nào
  chunk_index: { type: Number, default: -1 },
  // Nội dung note
  content: { type: String, default: '', maxlength: 2000 },
  // Màu highlight
  color: {
    type: String,
    enum: ['yellow', 'green', 'blue', 'pink', 'orange'],
    default: 'yellow',
  },
  // Metadata bổ sung
  is_pinned: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Compound index cho query hiệu suất
annotationSchema.index({ user_id: 1, document_id: 1, createdAt: -1 });

const Annotation = mongoose.model('Annotation', annotationSchema);
export default Annotation;
