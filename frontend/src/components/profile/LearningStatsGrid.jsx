/**
 * LearningStatsGrid — 6 stat cards hiển thị metrics học tập chính
 * CSS-only visualizations, no 3rd party charting
 */
import { BookOpen, Brain, Clock, HelpCircle, Layers, MessageSquare } from 'lucide-react';

export default function LearningStatsGrid({ overview }) {
  if (!overview) return null;

  const studyHours = Math.floor((overview.totalStudyTimeSeconds || 0) / 3600);
  const studyMinutes = Math.round(((overview.totalStudyTimeSeconds || 0) % 3600) / 60);

  const stats = [
    {
      icon: BookOpen, label: 'Documents',
      value: overview.totalDocuments || 0,
      color: '#818cf8', bg: 'rgba(129, 140, 248, 0.1)',
    },
    {
      icon: Brain, label: 'Concepts',
      value: overview.totalConcepts || 0,
      color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)',
    },
    {
      icon: Clock, label: 'Study Time',
      value: studyHours > 0 ? `${studyHours}h ${studyMinutes}m` : `${studyMinutes}m`,
      color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)',
    },
    {
      icon: HelpCircle, label: 'Quizzes Taken',
      value: overview.totalQuizzesTaken || 0,
      sub: overview.averageQuizScore > 0 ? `Avg: ${overview.averageQuizScore}%` : null,
      color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)',
    },
    {
      icon: Layers, label: 'Cards Reviewed',
      value: overview.totalFlashcardsReviewed || 0,
      sub: overview.dueFlashcards > 0 ? `${overview.dueFlashcards} due` : null,
      color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)',
    },
    {
      icon: MessageSquare, label: 'AI Chats',
      value: overview.totalChatMessages || 0,
      color: '#f472b6', bg: 'rgba(244, 114, 182, 0.1)',
    },
  ];

  return (
    <div className="profile-stats-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'var(--space-md)',
    }}>
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <div key={i} className="bento-card animate-fade-in-up" style={{
            padding: 'var(--space-lg)',
            animationDelay: `${i * 0.06}s`,
            opacity: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
              <div style={{
                width: 40, height: 40,
                borderRadius: 'var(--radius-md)',
                background: stat.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Icon size={20} color={stat.color} />
              </div>
            </div>
            <div style={{
              fontSize: '1.5rem', fontWeight: 700,
              color: 'var(--c-text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}>
              {stat.value}
            </div>
            <div style={{
              fontSize: '0.8125rem',
              color: 'var(--c-text-tertiary)',
              marginTop: 2,
            }}>
              {stat.label}
            </div>
            {stat.sub && (
              <div style={{
                fontSize: '0.75rem',
                color: stat.color,
                fontWeight: 500,
                marginTop: 4,
              }}>
                {stat.sub}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
