import { useState } from 'react';
import { TrendingUp } from 'lucide-react';

export default function StudyTrendChart({ data = [] }) {
  const [hovered, setHovered] = useState(null);
  const maxMin = Math.max(...data.map(d => d.studyMinutes), 1);
  // Show max 30 bars, sample if more
  const displayed = data.length > 30 ? data.filter((_, i) => i % Math.ceil(data.length / 30) === 0) : data;

  return (
    <div className="bento-card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={14} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>Study Time Trend</span>
        </div>
        <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>
          {Math.round(data.reduce((s, d) => s + d.studyMinutes, 0) / 60 * 10) / 10}h total
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140, padding: '0 2px', position: 'relative' }}>
        {displayed.map((d, i) => {
          const h = Math.max((d.studyMinutes / maxMin) * 100, d.studyMinutes > 0 ? 6 : 2);
          const isH = hovered === i;
          return (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              {isH && (
                <div className="animate-fade-in" style={{
                  position: 'absolute', bottom: `calc(${h}% + 8px)`, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--c-bg-elevated)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px', fontSize: '0.625rem', whiteSpace: 'nowrap', zIndex: 10, boxShadow: 'var(--shadow-md)',
                  color: 'var(--c-text-primary)', pointerEvents: 'none',
                }}>
                  <div style={{ fontWeight: 600 }}>{d.date.slice(5)}</div>
                  <div style={{ color: 'var(--c-text-tertiary)' }}>{d.studyMinutes}m • {d.sessions}s</div>
                </div>
              )}
              <div style={{
                width: '100%', maxWidth: 20, height: `${h}%`, borderRadius: 3, minHeight: 2,
                background: d.studyMinutes > 0 ? (isH ? 'var(--c-accent-gradient)' : 'rgba(99,102,241,0.5)') : 'var(--c-bg-tertiary)',
                transition: 'all 0.2s', transform: isH ? 'scaleY(1.05)' : 'scaleY(1)', transformOrigin: 'bottom',
              }} />
            </div>
          );
        })}
      </div>
      {/* X axis labels (first, middle, last) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.5625rem', color: 'var(--c-text-muted)' }}>
        <span>{displayed[0]?.date?.slice(5)}</span>
        <span>{displayed[Math.floor(displayed.length / 2)]?.date?.slice(5)}</span>
        <span>{displayed[displayed.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}
