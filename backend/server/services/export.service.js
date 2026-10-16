/**
 * NEUROVAULT — Export Service
 * Generates export files in multiple formats:
 * - CSV: Flashcards, quiz results, concept mastery
 * - Anki: Flashcard decks (tab-separated format compatible with Anki import)
 * - JSON: Full data backup
 * - Markdown: Document summaries, study notes
 */
import Document from '../models/Document.model.js';
import LearnerProgress from '../models/LearnerProgress.model.js';
import KnowledgeNode from '../models/KnowledgeNode.model.js';
import StudySession from '../models/StudySession.model.js';
import Gamification from '../models/Gamification.model.js';

/**
 * Export flashcards as Anki-compatible TSV.
 * Format: front\tback\ttags
 */
export async function exportFlashcardsAnki(userId, documentId) {
  const progress = await LearnerProgress.findOne({ user_id: userId }).lean();
  if (!progress?.flashcard_states?.length) return { content: '', count: 0, filename: 'flashcards.txt' };

  let cards = progress.flashcard_states;
  if (documentId) cards = cards.filter(c => c.document_id?.toString() === documentId);

  // Anki TSV: front<tab>back<tab>tags
  const header = '#separator:tab\n#html:false\n#deck:NeuroVault\n';
  const rows = cards.map(c => {
    const front = (c.front || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const back = (c.back || '').replace(/\t/g, ' ').replace(/\n/g, '<br>');
    const tags = `neurovault review_count:${c.review_count || 0}`;
    return `${front}\t${back}\t${tags}`;
  });

  return {
    content: header + rows.join('\n'),
    count: rows.length,
    filename: `neurovault_flashcards_${Date.now()}.txt`,
    mimeType: 'text/plain',
  };
}

/**
 * Export flashcards as CSV.
 */
export async function exportFlashcardsCSV(userId, documentId) {
  const progress = await LearnerProgress.findOne({ user_id: userId }).lean();
  if (!progress?.flashcard_states?.length) return { content: '', count: 0, filename: 'flashcards.csv' };

  let cards = progress.flashcard_states;
  if (documentId) cards = cards.filter(c => c.document_id?.toString() === documentId);

  const escCSV = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const header = 'Front,Back,Stability,Difficulty,ReviewCount,NextReview,LastReviewed';
  const rows = cards.map(c =>
    [
      escCSV(c.front), escCSV(c.back),
      c.stability?.toFixed(2) || '1.00', c.difficulty?.toFixed(2) || '5.00',
      c.review_count || 0,
      c.next_review_at ? new Date(c.next_review_at).toISOString() : '',
      c.last_reviewed_at ? new Date(c.last_reviewed_at).toISOString() : '',
    ].join(',')
  );

  return {
    content: header + '\n' + rows.join('\n'),
    count: rows.length,
    filename: `neurovault_flashcards_${Date.now()}.csv`,
    mimeType: 'text/csv',
  };
}

/**
 * Export concept mastery as CSV.
 */
export async function exportConceptsCSV(userId, documentId) {
  let filter = { user_id: userId };
  if (documentId) filter.document_id = documentId;

  const nodes = await KnowledgeNode.find(filter).select('concept definition mastery centrality_score').lean();

  const escCSV = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const header = 'Concept,Definition,MasteryLevel,ReviewCount,Stability,CentralityScore';
  const rows = nodes.map(n =>
    [
      escCSV(n.concept), escCSV(n.definition),
      ((n.mastery?.level || 0) * 100).toFixed(1) + '%',
      n.mastery?.review_count || 0,
      n.mastery?.stability?.toFixed(2) || '1.00',
      n.centrality_score?.toFixed(3) || '0',
    ].join(',')
  );

  return {
    content: header + '\n' + rows.join('\n'),
    count: rows.length,
    filename: `neurovault_concepts_${Date.now()}.csv`,
    mimeType: 'text/csv',
  };
}

/**
 * Export study sessions as CSV.
 */
export async function exportSessionsCSV(userId) {
  const sessions = await StudySession.find({ user_id: userId })
    .sort({ start_time: -1 }).limit(500)
    .select('type duration_seconds start_time end_time document_id results').lean();

  const header = 'Date,Type,Duration(min),DocumentID,QuizScore';
  const rows = sessions.map(s => [
    s.start_time ? new Date(s.start_time).toISOString() : '',
    s.type || '',
    ((s.duration_seconds || 0) / 60).toFixed(1),
    s.document_id || '',
    s.results?.quiz?.score_percent != null ? s.results.quiz.score_percent + '%' : '',
  ].join(','));

  return {
    content: header + '\n' + rows.join('\n'),
    count: rows.length,
    filename: `neurovault_sessions_${Date.now()}.csv`,
    mimeType: 'text/csv',
  };
}

/**
 * Export document as Markdown study notes.
 */
export async function exportDocumentMarkdown(userId, documentId) {
  const doc = await Document.findOne({ _id: documentId, user_id: userId })
    .select('title raw_text language metadata chunks').lean();
  if (!doc) return null;

  const concepts = await KnowledgeNode.find({ user_id: userId, document_id: documentId })
    .select('concept definition mastery').lean();

  let md = `# ${doc.title}\n\n`;
  md += `> Exported from NeuroVault on ${new Date().toLocaleDateString()}\n\n`;
  md += `**Language:** ${doc.language || 'unknown'} | **Words:** ${doc.metadata?.word_count || 0} | **Chunks:** ${doc.metadata?.chunk_count || 0}\n\n`;
  md += `---\n\n`;

  // Key concepts
  if (concepts.length > 0) {
    md += `## Key Concepts (${concepts.length})\n\n`;
    concepts.forEach(c => {
      const mastery = ((c.mastery?.level || 0) * 100).toFixed(0);
      md += `### ${c.concept} (${mastery}% mastery)\n\n`;
      if (c.definition) md += `${c.definition}\n\n`;
    });
    md += `---\n\n`;
  }

  // Full text
  md += `## Full Text\n\n${doc.raw_text || '(No text extracted)'}\n`;

  return {
    content: md,
    filename: `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)}_notes.md`,
    mimeType: 'text/markdown',
  };
}

/**
 * Full JSON backup of user data.
 */
export async function exportFullBackup(userId) {
  const [documents, progress, nodes, sessions, gamification] = await Promise.all([
    Document.find({ user_id: userId }).select('-chunks.embedding_vector -chunks.sparse_vector').lean(),
    LearnerProgress.findOne({ user_id: userId }).lean(),
    KnowledgeNode.find({ user_id: userId }).select('-embedding').lean(),
    StudySession.find({ user_id: userId }).sort({ start_time: -1 }).limit(1000).lean(),
    Gamification.findOne({ user_id: userId }).lean(),
  ]);

  const backup = {
    exportVersion: '1.0',
    exportDate: new Date().toISOString(),
    platform: 'NeuroVault',
    data: {
      documents: documents.map(d => ({ _id: d._id, title: d.title, language: d.language, metadata: d.metadata, createdAt: d.createdAt })),
      flashcards: progress?.flashcard_states || [],
      conceptMastery: progress?.concept_mastery || [],
      streak: progress?.streak || {},
      stats: progress?.stats || {},
      knowledgeNodes: nodes,
      studySessions: sessions,
      gamification: gamification ? { xp: gamification.xp, level: gamification.level, tier: gamification.tier, badges: gamification.badges, lifetime: gamification.lifetime } : null,
    },
    counts: {
      documents: documents.length,
      flashcards: progress?.flashcard_states?.length || 0,
      concepts: nodes.length,
      sessions: sessions.length,
    },
  };

  return {
    content: JSON.stringify(backup, null, 2),
    filename: `neurovault_backup_${Date.now()}.json`,
    mimeType: 'application/json',
  };
}
