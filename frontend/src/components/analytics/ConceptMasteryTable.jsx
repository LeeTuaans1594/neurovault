import { useState } from 'react';
import { Brain, TrendingUp, TrendingDown } from 'lucide-react';

export default function ConceptMasteryTable({ strong = [], weak = [], stats = {} }) {
  const [tab, setTab] = useState('strong');
  const items = tab === 'strong' ? strong : weak;

  return (
    <div className="bento-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={14} style={{ color: '#8b5cf6' }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>Concept Mastery</span>
          <span style={{ fontSize: '0.625rem', color: 'var(--c-text-muted)', background: 'var(--c-bg-secondary)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
            {stats.mastered || 0} mastered / {stats.total || 0} total
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
          <button onClick={() => setTab('strong')} style={{
            padding: '4px 12px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontSize: '0.625rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
            background: tab === 'strong' ? 'var(--c-bg-card)' : 'transparent',
            color: tab === 'strong' ? '#10b981' : 'var(--c-text-muted)',
          }}><TrendingUp size={10} /> Strongest</button>
          <button onClick={() => setTab('weak')} style={{
            padding: '4px 12px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontSize: '0.625rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
            background: tab === 'weak' ? 'var(--c-bg-card)' : 'transparent',
            color: tab === 'weak' ? '#ef4444' : 'var(--c-text-muted)',
          }}><TrendingDown size={10} /> Weakest</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--c-text-muted)', fontSize: '0.75rem' }}>
          No concept data yet. Complete quizzes to track mastery.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {items.map((c, i) => {
            const color = c.mastery >= 80 ? '#10b981' : c.mastery >= 50 ? '#f59e0b' : '#ef4444';
            return (
              <div key={c.concept} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 'var(--radius-md)', background: 'var(--c-bg-secondary)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.75rem', fontWeight: 500, color: 'var(--c-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{c.concept}</div>
                  <div style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)', marginTop: 2 }}>{c.attempts} attempts</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{c.mastery}%</span>
                  <div style={{ width: 48, height: 4, borderRadius: 2, background: 'var(--c-bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${c.mastery}%`, borderRadius: 2, background: color, transition: 'width 0.5s' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
