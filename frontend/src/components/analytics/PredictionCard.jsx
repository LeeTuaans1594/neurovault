import { TrendingUp, Brain, Zap } from 'lucide-react';

export default function PredictionCard({ prediction, conceptStats, gamification }) {
  const p = prediction || {};
  const cs = conceptStats || {};
  const g = gamification || {};

  return (
    <div className="bento-card" style={{
      padding: '1.25rem',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(139,92,246,0.03) 100%)',
      borderColor: 'rgba(99,102,241,0.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <TrendingUp size={14} style={{ color: '#8b5cf6' }} />
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>Insights</span>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Consistency */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-secondary)' }}>Consistency</span>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>{p.studyConsistency || 0}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--c-bg-tertiary)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${p.studyConsistency || 0}%`, borderRadius: 2, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', transition: 'width 0.8s' }} />
          </div>
        </div>

        {/* Avg daily */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-secondary)' }}>
          <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-secondary)' }}>Avg daily</span>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{p.avgDailyMinutes || 0} min</span>
        </div>

        {/* Concepts mastered */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-secondary)' }}>
          <Brain size={12} style={{ color: '#10b981' }} />
          <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-secondary)', flex: 1 }}>Concepts mastered</span>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#10b981' }}>{cs.mastered || 0}/{cs.total || 0}</span>
        </div>

        {/* Prediction */}
        {p.predictedNewMastery > 0 && (
          <div style={{
            padding: '8px 10px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)',
            fontSize: '0.6875rem', color: 'var(--c-text-secondary)',
          }}>
            📈 At this pace, you'll master <strong style={{ color: '#10b981' }}>~{p.predictedNewMastery}</strong> more concepts this week
          </div>
        )}

        {/* XP */}
        {g.xp != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-secondary)' }}>
            <Zap size={12} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-secondary)', flex: 1 }}>Lv.{g.level} {g.tier}</span>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#f59e0b' }}>{g.xp?.toLocaleString()} XP</span>
          </div>
        )}
      </div>
    </div>
  );
}
