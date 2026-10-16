/**
 * WeeklyChart — Bar chart 7 ngày gần nhất
 * Hiển thị study minutes bằng CSS bars (không dùng thư viện chart)
 * Hover tooltip hiển thị chi tiết
 */
import { useState } from 'react';
import { BarChart3, Clock, BookOpen } from 'lucide-react';

export default function WeeklyChart({ weeklyActivity = [] }) {
  const [hoveredDay, setHoveredDay] = useState(null);

  // Tìm max value để scale bars
  const maxMinutes = Math.max(
    ...weeklyActivity.map((d) => d.studyMinutes),
    1 // Tránh chia cho 0
  );

  // Tổng study time tuần này
  const totalWeekMinutes = weeklyActivity.reduce(
    (sum, d) => sum + d.studyMinutes,
    0
  );
  const totalWeekHours = (totalWeekMinutes / 60).toFixed(1);

  // So sánh với ngày hôm nay (last item)
  const today = weeklyActivity[weeklyActivity.length - 1];

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
          justifyContent: 'space-between',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <BarChart3 size={15} style={{ color: '#8b5cf6' }} />
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--c-text-primary)',
            }}
          >
            This Week
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.6875rem',
            color: 'var(--c-text-tertiary)',
          }}
        >
          <Clock size={11} />
          <strong style={{ color: 'var(--c-text-secondary)' }}>
            {totalWeekHours}h
          </strong>
          total
        </div>
      </div>

      {/* Bar Chart */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 6,
          height: 120,
          padding: '0 4px',
        }}
      >
        {weeklyActivity.map((day, i) => {
          const barHeight = maxMinutes > 0
            ? Math.max((day.studyMinutes / maxMinutes) * 100, day.studyMinutes > 0 ? 8 : 2)
            : 2;
          const isHovered = hoveredDay === i;
          const isToday = i === weeklyActivity.length - 1;

          return (
            <div
              key={day.date}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                position: 'relative',
              }}
              onMouseEnter={() => setHoveredDay(i)}
              onMouseLeave={() => setHoveredDay(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div
                  className="animate-fade-in"
                  style={{
                    position: 'absolute',
                    bottom: `calc(${barHeight}% + 30px)`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--c-bg-elevated)',
                    border: '1px solid var(--c-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 10px',
                    fontSize: '0.6875rem',
                    color: 'var(--c-text-primary)',
                    whiteSpace: 'nowrap',
                    zIndex: 10,
                    boxShadow: 'var(--shadow-md)',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{day.date}</div>
                  <div style={{ color: 'var(--c-text-secondary)', marginTop: 2 }}>
                    {day.studyMinutes} min • {day.quizzes + day.flashcards + day.chats} sessions
                  </div>
                </div>
              )}

              {/* Bar */}
              <div
                style={{
                  width: '100%',
                  maxWidth: 28,
                  height: `${barHeight}%`,
                  borderRadius: 'var(--radius-sm)',
                  background: day.studyMinutes > 0
                    ? isToday
                      ? 'var(--c-accent-gradient)'
                      : 'rgba(99, 102, 241, 0.45)'
                    : 'var(--c-bg-tertiary)',
                  transition: 'all 0.3s ease',
                  transform: isHovered ? 'scaleY(1.08)' : 'scaleY(1)',
                  transformOrigin: 'bottom',
                  cursor: 'pointer',
                  minHeight: 3,
                }}
              />

              {/* Day label */}
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: isToday ? 600 : 400,
                  color: isToday ? 'var(--c-accent)' : 'var(--c-text-muted)',
                  letterSpacing: '0.02em',
                }}
              >
                {day.day}
              </span>
            </div>
          );
        })}
      </div>

      {/* Today summary */}
      {today && today.studyMinutes > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 'var(--space-md)',
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--c-accent-glow)',
            fontSize: '0.6875rem',
            color: 'var(--c-text-secondary)',
          }}
        >
          <BookOpen size={12} style={{ color: 'var(--c-accent)' }} />
          Today: <strong style={{ color: 'var(--c-accent)' }}>{today.studyMinutes} min</strong>
          across {today.quizzes + today.flashcards + today.chats} sessions
        </div>
      )}
    </div>
  );
}
