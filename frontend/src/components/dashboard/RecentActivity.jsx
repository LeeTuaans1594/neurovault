/**
 * RecentActivity — Danh sách 5 sessions gần nhất
 * Timeline style, type icons, relative time
 */
import { MessageSquare, Target, Layers, BookOpen, Clock } from 'lucide-react';

const TYPE_CONFIG = {
  quiz: {
    icon: Target,
    color: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.1)',
    label: 'Quiz',
  },
  flashcard: {
    icon: Layers,
    color: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.1)',
    label: 'Flashcards',
  },
  chat: {
    icon: MessageSquare,
    color: 'var(--c-accent)',
    glow: 'var(--c-accent-glow)',
    label: 'AI Chat',
  },
  reading: {
    icon: BookOpen,
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.1)',
    label: 'Reading',
  },
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatDuration(seconds) {
  if (!seconds || seconds < 60) return '<1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
}

export default function RecentActivity({ recentActivity = [] }) {
  if (recentActivity.length === 0) {
    return (
      <div
        className="bento-card"
        style={{
          padding: 'var(--space-xl)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--c-text-primary)',
            marginBottom: 8,
          }}
        >
          Recent Activity
        </div>
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--c-text-muted)',
            fontStyle: 'italic',
          }}
        >
          No study sessions yet. Upload a document to get started!
        </div>
      </div>
    );
  }

  return (
    <div
      className="bento-card"
      style={{ padding: 'var(--space-lg)' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-md)',
        }}
      >
        <Clock size={14} style={{ color: 'var(--c-text-secondary)' }} />
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--c-text-primary)',
          }}
        >
          Recent Activity
        </span>
      </div>

      {/* Activity list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {recentActivity.map((activity, i) => {
          const cfg = TYPE_CONFIG[activity.type] || TYPE_CONFIG.reading;
          const Icon = cfg.icon;

          return (
            <div
              key={activity.id || i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: '8px 6px',
                borderRadius: 'var(--radius-sm)',
                transition: 'all 0.15s ease',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-bg-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 'var(--radius-sm)',
                  background: cfg.glow,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={14} style={{ color: cfg.color }} strokeWidth={1.5} />
              </div>

              {/* Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: 'var(--c-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cfg.label}
                  {activity.documentTitle && (
                    <span style={{ color: 'var(--c-text-tertiary)', fontWeight: 400 }}>
                      {' '}— {activity.documentTitle}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.6875rem',
                    color: 'var(--c-text-tertiary)',
                    marginTop: 1,
                  }}
                >
                  <span>{formatDuration(activity.duration)}</span>
                  {activity.score != null && (
                    <span style={{
                      color: activity.score >= 70 ? 'var(--c-success)' : '#f59e0b',
                    }}>
                      {activity.score}%
                    </span>
                  )}
                  {activity.cardsReviewed != null && (
                    <span>{activity.cardsReviewed} cards</span>
                  )}
                </div>
              </div>

              {/* Time */}
              <span
                style={{
                  fontSize: '0.625rem',
                  color: 'var(--c-text-muted)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatRelativeTime(activity.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
