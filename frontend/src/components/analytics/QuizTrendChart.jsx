import { useState } from 'react';
import { Target } from 'lucide-react';

export default function QuizTrendChart({ quizData = [], weeklyTrend = [] }) {
  const [tab, setTab] = useState('weekly'); // weekly | individual

  return (
    <div className="bento-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={14} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>Quiz Performance</span>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          {['weekly', 'individual'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '3px 10px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontSize: '0.625rem', fontWeight: 600, textTransform: 'capitalize',
              background: tab === t ? 'var(--c-bg-card)' : 'transparent',
              color: tab === t ? 'var(--c-text-primary)' : 'var(--c-text-muted)',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'weekly' ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
          {weeklyTrend.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-muted)', fontSize: '0.75rem' }}>No quiz data yet</div>
          ) : weeklyTrend.map((w, i) => (
            <div key={w.weekLabel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.625rem', fontWeight: 600, color: w.average >= 80 ? '#10b981' : w.average >= 50 ? '#f59e0b' : '#ef4444' }}>{w.average}%</span>
              <div style={{
                width: '100%', maxWidth: 32, height: `${Math.max(w.average, 5)}%`, borderRadius: 4,
                background: w.average >= 80 ? 'linear-gradient(to top, #10b981, #34d399)' : w.average >= 50 ? 'linear-gradient(to top, #f59e0b, #fbbf24)' : 'linear-gradient(to top, #ef4444, #f87171)',
              }} />
              <span style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)' }}>{w.weekLabel}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ height: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {quizData.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-muted)', fontSize: '0.75rem' }}>No quizzes taken</div>
          ) : quizData.slice(-10).reverse().map((q, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-secondary)' }}>
              <span style={{ fontSize: '0.625rem', color: 'var(--c-text-muted)', width: 50 }}>{q.date.slice(5)}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--c-bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${q.score}%`, borderRadius: 3, background: q.score >= 80 ? '#10b981' : q.score >= 50 ? '#f59e0b' : '#ef4444', transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-primary)', width: 35, textAlign: 'right' }}>{q.score}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
