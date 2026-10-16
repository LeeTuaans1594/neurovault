/**
 * MasteryOverviewCard — Phân bổ mastery (mastered/learning/beginner)
 * + top concepts progress bars, CSS-only
 */

export default function MasteryOverviewCard({ masteryBreakdown }) {
  if (!masteryBreakdown) return null;

  const { mastered, learning, beginner, total, topConcepts } = masteryBreakdown;

  // Percentage calculations (tránh chia 0)
  const pMastered = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const pLearning = total > 0 ? Math.round((learning / total) * 100) : 0;
  const pBeginner = total > 0 ? Math.round((beginner / total) * 100) : 0;

  const segments = [
    { label: 'Mastered', count: mastered, pct: pMastered, color: '#34d399' },
    { label: 'Learning', count: learning, pct: pLearning, color: '#818cf8' },
    { label: 'Beginner', count: beginner, pct: pBeginner, color: '#fbbf24' },
  ];

  return (
    <div className="bento-card" style={{ padding: 'var(--space-xl)' }}>
      <h3 style={{
        fontSize: '1rem', fontWeight: 600,
        color: 'var(--c-text-primary)',
        marginBottom: 'var(--space-lg)',
      }}>
        Mastery Overview
      </h3>

      {total === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-xl)',
          color: 'var(--c-text-tertiary)',
          fontSize: '0.875rem',
        }}>
          No concepts tracked yet. Study documents to build mastery!
        </div>
      ) : (
        <>
          {/* Stacked bar */}
          <div style={{
            display: 'flex',
            height: 12,
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
            background: 'var(--c-bg-tertiary)',
            marginBottom: 'var(--space-md)',
          }}>
            {segments.map((seg) => (
              seg.pct > 0 && (
                <div key={seg.label} style={{
                  width: `${seg.pct}%`,
                  background: seg.color,
                  transition: 'width 0.6s var(--ease-out-expo)',
                }} />
              )
            ))}
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex', gap: 'var(--space-lg)',
            marginBottom: 'var(--space-xl)',
          }}>
            {segments.map((seg) => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 10, height: 10,
                  borderRadius: '50%',
                  background: seg.color,
                }} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--c-text-secondary)' }}>
                  {seg.label} ({seg.count})
                </span>
              </div>
            ))}
          </div>

          {/* Top Concepts */}
          {topConcepts && topConcepts.length > 0 && (
            <>
              <div style={{
                fontSize: '0.8125rem', fontWeight: 600,
                color: 'var(--c-text-secondary)',
                marginBottom: 'var(--space-sm)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Top Concepts
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topConcepts.map((concept, i) => (
                  <div key={i}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontSize: '0.8125rem',
                        color: 'var(--c-text-primary)',
                        fontWeight: 500,
                        maxWidth: '70%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {concept.name}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        color: concept.mastery >= 80 ? '#34d399' : concept.mastery >= 40 ? '#818cf8' : '#fbbf24',
                        fontWeight: 600,
                      }}>
                        {concept.mastery}%
                      </span>
                    </div>
                    <div style={{
                      height: 6,
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--c-bg-tertiary)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${concept.mastery}%`,
                        borderRadius: 'var(--radius-full)',
                        background: concept.mastery >= 80 ? '#34d399' : concept.mastery >= 40 ? '#818cf8' : '#fbbf24',
                        transition: 'width 0.8s var(--ease-out-expo)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
