/**
 * MasteryDonut — Donut chart hiển thị phân bổ mastery levels
 * CSS conic-gradient donut (không dùng thư viện chart)
 * Animated entrance, hover interactions
 */
import { Brain } from 'lucide-react';

export default function MasteryDonut({ masteryOverview = {} }) {
  const {
    mastered = 0,
    learning = 0,
    beginner = 0,
    total = 0,
    masteryPercentage = 0,
    distribution = [],
  } = masteryOverview;

  // Tính angle cho mỗi segment (conic-gradient)
  const getConicGradient = () => {
    if (total === 0) {
      return 'conic-gradient(var(--c-bg-tertiary) 0deg 360deg)';
    }

    const segments = [];
    let currentAngle = 0;

    const data = [
      { value: mastered, color: '#34d399' }, // Green
      { value: learning, color: '#818cf8' }, // Indigo
      { value: beginner, color: '#fbbf24' }, // Amber
    ];

    data.forEach(({ value, color }) => {
      if (value > 0) {
        const angle = (value / total) * 360;
        segments.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);
        currentAngle += angle;
      }
    });

    // Fill còn lại nếu có gap nhỏ
    if (currentAngle < 360) {
      segments.push(`var(--c-bg-tertiary) ${currentAngle}deg 360deg`);
    }

    return `conic-gradient(${segments.join(', ')})`;
  };

  return (
    <div
      className="bento-card"
      style={{ padding: 'var(--space-lg)' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <Brain size={15} style={{ color: '#8b5cf6' }} />
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--c-text-primary)',
          }}
        >
          Mastery
        </span>
      </div>

      {/* Donut + Center text */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-xl)',
        }}
      >
        {/* Donut */}
        <div
          style={{
            position: 'relative',
            width: 100,
            height: 100,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: getConicGradient(),
              transition: 'all 0.6s ease',
            }}
          />
          {/* Inner circle (create donut hole) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 62,
              height: 62,
              borderRadius: '50%',
              background: 'var(--c-bg-card)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--c-text-primary)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              {total > 0 ? `${masteryPercentage}%` : '—'}
            </span>
            {total > 0 && (
              <span
                style={{
                  fontSize: '0.5rem',
                  color: 'var(--c-text-tertiary)',
                  marginTop: 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                mastered
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
          }}
        >
          {[
            { label: 'Mastered', value: mastered, color: '#34d399', desc: '≥80%' },
            { label: 'Learning', value: learning, color: '#818cf8', desc: '40-80%' },
            { label: 'Beginner', value: beginner, color: '#fbbf24', desc: '<40%' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: 'var(--c-text-primary)',
                  }}
                >
                  {item.value}{' '}
                  <span style={{ color: 'var(--c-text-tertiary)', fontWeight: 400 }}>
                    {item.label}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {total === 0 && (
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'var(--c-text-muted)',
                fontStyle: 'italic',
              }}
            >
              No concepts tracked yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
