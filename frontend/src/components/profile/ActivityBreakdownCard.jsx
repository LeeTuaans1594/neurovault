/**
 * ActivityBreakdownCard — Phân tích hoạt động theo loại (quiz/flashcard/chat/reading)
 * Hiển thị horizontal bars + labels, CSS-only
 */
import { HelpCircle, Layers, MessageSquare, BookOpen } from 'lucide-react';

const TYPE_CONFIG = {
  quiz: { icon: HelpCircle, label: 'Quizzes', color: '#f59e0b' },
  flashcard: { icon: Layers, label: 'Flashcards', color: '#34d399' },
  chat: { icon: MessageSquare, label: 'AI Chat', color: '#818cf8' },
  reading: { icon: BookOpen, label: 'Reading', color: '#06b6d4' },
};

export default function ActivityBreakdownCard({ activityByType }) {
  if (!activityByType) return null;

  // Chuyển object thành array và tính maxCount
  const entries = Object.entries(TYPE_CONFIG).map(([key, config]) => {
    const data = activityByType[key] || {};
    return {
      key,
      ...config,
      count: typeof data === 'object' ? (data.count || 0) : data,
      minutes: typeof data === 'object' ? (data.totalMinutes || 0) : 0,
    };
  });

  const maxCount = Math.max(...entries.map(e => e.count), 1);

  return (
    <div className="bento-card" style={{ padding: 'var(--space-xl)' }}>
      <h3 style={{
        fontSize: '1rem', fontWeight: 600,
        color: 'var(--c-text-primary)',
        marginBottom: 'var(--space-lg)',
      }}>
        Activity Breakdown
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {entries.map((entry) => {
          const Icon = entry.icon;
          const barWidth = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;

          return (
            <div key={entry.key}>
              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={16} color={entry.color} />
                  <span style={{
                    fontSize: '0.8125rem',
                    color: 'var(--c-text-secondary)',
                    fontWeight: 500,
                  }}>
                    {entry.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: '0.875rem',
                    color: 'var(--c-text-primary)',
                    fontWeight: 600,
                  }}>
                    {entry.count}
                  </span>
                  {entry.minutes > 0 && (
                    <span style={{
                      fontSize: '0.6875rem',
                      color: 'var(--c-text-tertiary)',
                    }}>
                      {entry.minutes}m
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                height: 8,
                borderRadius: 'var(--radius-full)',
                background: 'var(--c-bg-tertiary)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${barWidth}%`,
                  borderRadius: 'var(--radius-full)',
                  background: entry.color,
                  transition: 'width 0.8s var(--ease-out-expo)',
                  minWidth: entry.count > 0 ? 4 : 0,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
