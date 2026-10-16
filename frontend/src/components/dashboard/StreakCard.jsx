/**
 * StreakCard — Hiển thị streak hiện tại + longest streak
 * Animated flame icon, pulse khi đang active hôm nay
 */
import { Flame, Trophy, Calendar, Zap } from 'lucide-react';

export default function StreakCard({ streak = {} }) {
  const {
    current = 0,
    longest = 0,
    isActiveToday = false,
    lastStudyDate = null,
  } = streak;

  // Tính ngày liên tiếp để hiển thị thông báo
  const getStreakMessage = () => {
    if (isActiveToday && current >= 7) return "You're on fire! 🔥";
    if (isActiveToday && current >= 3) return 'Great momentum!';
    if (isActiveToday) return 'Keep it up!';
    if (current > 0) return "Don't break the chain!";
    return 'Start studying today!';
  };

  // Màu flame dựa trên streak level
  const getFlameColor = () => {
    if (current >= 30) return '#ef4444'; // Red — epic
    if (current >= 14) return '#f97316'; // Orange — impressive
    if (current >= 7) return '#f59e0b';  // Amber — good
    if (current >= 3) return '#fbbf24';  // Yellow — building
    return '#d4d4d8';                     // Gray — start
  };

  const flameColor = getFlameColor();

  return (
    <div
      className="bento-card"
      style={{
        padding: 'var(--space-lg)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background glow khi active */}
      {isActiveToday && current > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${flameColor}15 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: `${flameColor}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isActiveToday && current > 0
              ? 'pulse-glow 2s ease-in-out infinite'
              : 'none',
          }}
        >
          <Flame
            size={18}
            style={{ color: flameColor }}
            strokeWidth={2}
          />
        </div>
        <div>
          <div
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--c-text-primary)',
            }}
          >
            Study Streak
          </div>
          <div
            style={{
              fontSize: '0.6875rem',
              color: 'var(--c-text-tertiary)',
            }}
          >
            {getStreakMessage()}
          </div>
        </div>
      </div>

      {/* Current Streak — Big Number */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 'var(--space-lg)',
        }}
      >
        <span
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: current > 0 ? flameColor : 'var(--c-text-muted)',
          }}
        >
          {current}
        </span>
        <span
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--c-text-tertiary)',
          }}
        >
          {current === 1 ? 'day' : 'days'}
        </span>
      </div>

      {/* Sub stats */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Trophy size={13} style={{ color: '#fbbf24' }} />
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--c-text-secondary)',
            }}
          >
            Best: <strong style={{ color: 'var(--c-text-primary)' }}>{longest}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap
            size={13}
            style={{
              color: isActiveToday ? 'var(--c-success)' : 'var(--c-text-tertiary)',
            }}
          />
          <span
            style={{
              fontSize: '0.75rem',
              color: isActiveToday ? 'var(--c-success)' : 'var(--c-text-tertiary)',
            }}
          >
            {isActiveToday ? 'Active today' : 'Not studied yet'}
          </span>
        </div>
      </div>

      {/* 7-day dots (visual mini tracker) */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginTop: 'var(--space-md)',
          justifyContent: 'flex-start',
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => {
          // i=0 là 6 ngày trước, i=6 là hôm nay
          const isWithinStreak = (6 - i) < current;
          const isToday = i === 6;
          return (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isWithinStreak
                  ? flameColor
                  : 'var(--c-bg-tertiary)',
                opacity: isWithinStreak ? 1 : 0.4,
                boxShadow: isToday && isActiveToday
                  ? `0 0 8px ${flameColor}`
                  : 'none',
                transition: 'all 0.3s ease',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
