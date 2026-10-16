/**
 * MilestonesCard — Hiển thị các cột mốc đạt được + chưa đạt
 * Dạng danh sách badges với icon, label, trạng thái
 */
import { Trophy } from 'lucide-react';

export default function MilestonesCard({ milestones }) {
  if (!milestones || milestones.length === 0) return null;

  const achieved = milestones.filter(m => m.achieved);
  const pending = milestones.filter(m => !m.achieved);

  return (
    <div className="bento-card" style={{ padding: 'var(--space-xl)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 'var(--space-lg)',
      }}>
        <Trophy size={18} color="#fbbf24" />
        <h3 style={{
          fontSize: '1rem', fontWeight: 600,
          color: 'var(--c-text-primary)',
        }}>
          Milestones
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {achieved.map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--c-success-glow)',
            border: '1px solid rgba(52, 211, 153, 0.15)',
          }}>
            <span style={{ fontSize: '1.125rem' }}>{m.icon}</span>
            <span style={{
              fontSize: '0.8125rem',
              color: 'var(--c-success)',
              fontWeight: 500,
              flex: 1,
            }}>
              {m.label}
            </span>
            <span style={{
              fontSize: '0.6875rem',
              color: 'var(--c-success)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              ✓ Done
            </span>
          </div>
        ))}
        {pending.map((m, i) => (
          <div key={`p-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--c-bg-tertiary)',
            border: '1px solid var(--c-border)',
            opacity: 0.6,
          }}>
            <span style={{ fontSize: '1.125rem', filter: 'grayscale(1)' }}>{m.icon}</span>
            <span style={{
              fontSize: '0.8125rem',
              color: 'var(--c-text-tertiary)',
              fontWeight: 500,
              flex: 1,
            }}>
              {m.label}
            </span>
            <span style={{
              fontSize: '0.6875rem',
              color: 'var(--c-text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}>
              Locked
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
