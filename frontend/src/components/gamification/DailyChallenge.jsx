import { useState, useEffect } from 'react';
import { Target, CheckCircle2, Clock, Zap } from 'lucide-react';

/**
 * DailyChallenge — Card hiển thị daily challenge với progress bar.
 */
export default function DailyChallenge({ challenge }) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (challenge) {
        const pct = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));
        setAnimatedProgress(pct);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [challenge?.progress]);

  if (!challenge) return null;

  const isCompleted = challenge.completed;
  const progressPct = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));

  const typeIcons = {
    quiz_score: '🎯',
    flashcard_count: '🃏',
    study_time: '⏰',
    chat_count: '💬',
    upload_doc: '📚',
  };

  return (
    <div className="bento-card" style={{
      padding: '1.25rem',
      background: isCompleted
        ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(5,150,105,0.04) 100%)'
        : 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(217,119,6,0.04) 100%)',
      borderColor: isCompleted ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={14} style={{ color: isCompleted ? 'var(--c-success)' : '#f59e0b' }} />
          <span style={{
            fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: isCompleted ? 'var(--c-success)' : '#f59e0b',
          }}>
            Daily Challenge
          </span>
        </div>
        {isCompleted ? (
          <CheckCircle2 size={16} style={{ color: 'var(--c-success)' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={12} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#f59e0b' }}>
              +{challenge.xp_reward} XP
            </span>
          </div>
        )}
      </div>

      {/* Challenge Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.5rem' }}>{typeIcons[challenge.challenge_type] || '🎯'}</span>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
            {challenge.title}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)' }}>
            {challenge.description}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginBottom: 4,
          fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', fontWeight: 500,
        }}>
          <span>{challenge.progress} / {challenge.target}</span>
          <span>{progressPct}%</span>
        </div>
        <div style={{
          height: 6, borderRadius: 3,
          background: 'var(--c-bg-tertiary)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: isCompleted
              ? 'linear-gradient(90deg, #10b981, #059669)'
              : 'linear-gradient(90deg, #f59e0b, #d97706)',
            width: `${animatedProgress}%`,
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
      </div>

      {/* Completed badge */}
      {isCompleted && (
        <div style={{
          marginTop: '0.75rem', textAlign: 'center',
          fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-success)',
        }}>
          ✅ Challenge completed!
        </div>
      )}
    </div>
  );
}
