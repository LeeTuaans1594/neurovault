/**
 * StatsGrid — Dàn stat cards cải tiến cho Dashboard v2
 * Hiển thị Documents, Concepts, Study Hours, Quizzes, Flashcards, Due Reviews
 * Mỗi card có icon, value, label, và optional trend badge
 */
import {
  FileText, Brain, Clock, Target,
  Layers, AlertCircle, MessageSquare
} from 'lucide-react';

export default function StatsGrid({ stats = {}, documents = [] }) {
  const {
    totalDocuments = 0,
    totalConcepts = 0,
    totalStudyTimeMinutes = 0,
    totalQuizzesTaken = 0,
    totalFlashcardsReviewed = 0,
    totalChatMessages = 0,
    averageQuizScore = 0,
    dueFlashcards = 0,
  } = stats;

  const displayHours = (totalStudyTimeMinutes / 60).toFixed(1);

  const cards = [
    {
      label: 'Documents',
      value: documents.length || totalDocuments,
      icon: FileText,
      color: 'var(--c-accent)',
      glow: 'var(--c-accent-glow)',
    },
    {
      label: 'Concepts',
      value: totalConcepts,
      icon: Brain,
      color: '#8b5cf6',
      glow: 'rgba(139, 92, 246, 0.1)',
    },
    {
      label: 'Study Hours',
      value: displayHours,
      icon: Clock,
      color: '#10b981',
      glow: 'rgba(16, 185, 129, 0.1)',
    },
    {
      label: 'Quizzes',
      value: totalQuizzesTaken,
      icon: Target,
      color: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.1)',
      sub: averageQuizScore > 0 ? `${averageQuizScore}% avg` : null,
    },
    {
      label: 'Cards Reviewed',
      value: totalFlashcardsReviewed,
      icon: Layers,
      color: '#06b6d4',
      glow: 'rgba(6, 182, 212, 0.1)',
    },
    {
      label: 'Due Reviews',
      value: dueFlashcards,
      icon: AlertCircle,
      color: dueFlashcards > 0 ? '#f87171' : 'var(--c-text-muted)',
      glow: dueFlashcards > 0 ? 'rgba(248, 113, 113, 0.1)' : 'var(--c-bg-secondary)',
      highlight: dueFlashcards > 0,
    },
  ];

  return (
    <div
      className="dashboard-stats-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 'var(--space-sm)',
      }}
    >
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`bento-card animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          style={{
            padding: 'var(--space-md)',
            borderColor: card.highlight ? 'rgba(248, 113, 113, 0.2)' : undefined,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                background: card.glow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <card.icon size={15} style={{ color: card.color }} strokeWidth={2} />
            </div>
          </div>
          <div
            style={{
              fontSize: '1.375rem',
              fontWeight: 700,
              color: 'var(--c-text-primary)',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}
          >
            {card.value}
          </div>
          <div
            style={{
              fontSize: '0.6875rem',
              color: 'var(--c-text-tertiary)',
              marginTop: 2,
              fontWeight: 500,
            }}
          >
            {card.label}
          </div>
          {card.sub && (
            <div
              style={{
                fontSize: '0.625rem',
                color: 'var(--c-accent)',
                marginTop: 4,
                fontWeight: 500,
              }}
            >
              {card.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
