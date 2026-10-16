import { Activity } from 'lucide-react';

const COLORS = { quiz: '#f59e0b', flashcard: '#8b5cf6', chat: '#6366f1', reading: '#10b981' };
const LABELS = { quiz: 'Quizzes', flashcard: 'Flashcards', chat: 'Chat', reading: 'Reading' };

export default function SessionDistribution({ typeData, timeData }) {
  const t = typeData || {};
  const tm = timeData || {};
  const total = Object.values(t).reduce((s, v) => s + v, 0) || 1;

  // Build conic gradient
  const segments = [];
  let angle = 0;
  Object.entries(t).forEach(([key, val]) => {
    if (val > 0) {
      const a = (val / total) * 360;
      segments.push(`${COLORS[key]} ${angle}deg ${angle + a}deg`);
      angle += a;
    }
  });
  if (angle < 360) segments.push(`var(--c-bg-tertiary) ${angle}deg 360deg`);
  const gradient = segments.length ? `conic-gradient(${segments.join(', ')})` : 'conic-gradient(var(--c-bg-tertiary) 0deg 360deg)';

  return (
    <div className="bento-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <Activity size={14} style={{ color: '#6366f1' }} />
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>Session Mix</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        {/* Donut */}
        <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: gradient }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 54, height: 54, borderRadius: '50%', background: 'var(--c-bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', fontWeight: 800, color: 'var(--c-text-primary)',
          }}>{total > 1 ? total : 0}</div>
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {Object.entries(COLORS).map(([key, color]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-secondary)' }}>{LABELS[key]}</span>
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-primary)', fontWeight: 600 }}>
                {t[key] || 0} <span style={{ color: 'var(--c-text-muted)', fontWeight: 400 }}>• {tm[key] || 0}m</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
