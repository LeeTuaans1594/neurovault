import mongoose from 'mongoose';

const edgeSchema = new mongoose.Schema({
  target_concept_id: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeNode', required: true },
  relation_type: {
    type: String,
    enum: ['prerequisite', 'related', 'part_of', 'example_of', 'causes', 'requires'],
    default: 'related',
  },
  weight: { type: Number, default: 1.0, min: 0, max: 1 },
  evidence_text: { type: String, default: '' },
}, { _id: false });

const masterySchema = new mongoose.Schema({
  level: { type: Number, default: 0.0, min: 0, max: 1 },
  ease_factor: { type: Number, default: 2.5 },
  stability: { type: Number, default: 1.0 },
  last_reviewed: { type: Date, default: null },
  next_review: { type: Date, default: null },
  review_count: { type: Number, default: 0 },
  consecutive_correct: { type: Number, default: 0 },
}, { _id: false });

const knowledgeNodeSchema = new mongoose.Schema({
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
  concept: {
    type: String,
    required: true,
    trim: true,
  },
  definition: { type: String, default: '' },
  embedding: { type: [Number], default: [] },
  related_chunk_ids: { type: [String], default: [] },
  edges: [edgeSchema],
  mastery: {
    type: masterySchema,
    default: () => ({}),
  },
  topic_cluster: { type: Number, default: -1 },
  centrality_score: { type: Number, default: 0 },
}, {
  timestamps: true,
});

knowledgeNodeSchema.index({ user_id: 1, document_id: 1 });
knowledgeNodeSchema.index({ concept: 'text' });

const KnowledgeNode = mongoose.model('KnowledgeNode', knowledgeNodeSchema);
export default KnowledgeNode;
