import { Clock } from 'lucide-react';

export default function StudyPatterns({ patterns }) {
  if (!patterns) return null;
  const { hourDistribution = [], dayDistribution = [], dayLabels = [], peakHour, peakDay } = patterns;
  const maxH = Math.max(...hourDistribution, 1);
  const maxD = Math.max(...dayDistribution, 1);

  return (
    <div className="bento-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <Clock size={14} style={{ color: '#10b981' }} />
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>Study Patterns</span>
      </div>

      {/* Peak info */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <div style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-secondary)' }}>
          <div style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Hour</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{peakHour}:00</div>
        </div>
        <div style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-secondary)' }}>
          <div style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Day</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{peakDay}</div>
        </div>
      </div>

      {/* Hour heatmap (24h) */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hours</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
          {hourDistribution.map((v, i) => (
            <div key={i} title={`${i}:00 — ${v} sessions`} style={{
              height: 16, borderRadius: 2,
              background: v > 0 ? `rgba(99,102,241,${Math.max(0.15, v / maxH * 0.9)})` : 'var(--c-bg-tertiary)',
              cursor: 'default',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: '0.5rem', color: 'var(--c-text-muted)' }}>
          <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
        </div>
      </div>

      {/* Day-of-week bars */}
      <div>
        <div style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Days</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {dayDistribution.map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: '100%', height: Math.max(4, (v / maxD) * 32), borderRadius: 3,
                background: v > 0 ? 'rgba(16,185,129,0.5)' : 'var(--c-bg-tertiary)',
              }} />
              <span style={{ fontSize: '0.5rem', color: 'var(--c-text-muted)' }}>{dayLabels[i]?.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
