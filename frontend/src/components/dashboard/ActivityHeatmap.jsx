/**
 * ActivityHeatmap — GitHub-style contribution graph cho 365 ngày
 * 7 rows (Mon-Sun) x ~52 columns (weeks)
 * Color intensity: 5 levels dựa trên activity count
 */
import { useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 5-level intensity ramp (indigo theme)
const INTENSITY_COLORS = {
  dark: [
    'rgba(255,255,255,0.04)',   // Level 0 — no activity
    'rgba(99, 102, 241, 0.25)', // Level 1 — low
    'rgba(99, 102, 241, 0.45)', // Level 2 — medium
    'rgba(99, 102, 241, 0.70)', // Level 3 — high
    'rgba(99, 102, 241, 1.0)',  // Level 4 — max
  ],
  light: [
    'rgba(0,0,0,0.04)',
    'rgba(99, 102, 241, 0.20)',
    'rgba(99, 102, 241, 0.40)',
    'rgba(99, 102, 241, 0.65)',
    'rgba(99, 102, 241, 0.90)',
  ],
};

function getIntensityLevel(count) {
  if (count === 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export default function ActivityHeatmap({ heatmapData = [] }) {
  const [hoveredCell, setHoveredCell] = useState(null);

  // Detect theme (check body class)
  const isDark = typeof document !== 'undefined' &&
    !document.documentElement.classList.contains('light');
  const colors = isDark ? INTENSITY_COLORS.dark : INTENSITY_COLORS.light;

  // Chuyển flat array thành grid 7xN (Mon=0 → Sun=6)
  const { weeks, monthLabels, totalSessions, activeDays } = useMemo(() => {
    if (!heatmapData.length) {
      return { weeks: [], monthLabels: [], totalSessions: 0, activeDays: 0 };
    }

    let total = 0;
    let active = 0;

    // Xác định ngày bắt đầu (cần pad để hàng 0 = Monday)
    const firstDate = new Date(heatmapData[0].date + 'T00:00:00');
    // getDay(): 0=Sun, 1=Mon...6=Sat → chuyển thành 0=Mon...6=Sun
    const firstDayOfWeek = (firstDate.getDay() + 6) % 7;

    // Pad đầu với null cells
    const paddedData = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      paddedData.push(null);
    }
    heatmapData.forEach((d) => {
      paddedData.push(d);
      total += d.count;
      if (d.count > 0) active++;
    });

    // Chia thành weeks (mỗi week = 7 cells)
    const weeksList = [];
    for (let i = 0; i < paddedData.length; i += 7) {
      weeksList.push(paddedData.slice(i, i + 7));
    }

    // Month labels — tìm vị trí tuần đầu tiên của mỗi tháng
    const labels = [];
    let lastMonth = -1;
    weeksList.forEach((week, weekIdx) => {
      const firstDay = week.find((d) => d !== null);
      if (firstDay) {
        const month = new Date(firstDay.date + 'T00:00:00').getMonth();
        if (month !== lastMonth) {
          labels.push({ month: MONTHS[month], weekIdx });
          lastMonth = month;
        }
      }
    });

    return {
      weeks: weeksList,
      monthLabels: labels,
      totalSessions: total,
      activeDays: active,
    };
  }, [heatmapData]);

  const cellSize = 11;
  const cellGap = 3;

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
          justifyContent: 'space-between',
          marginBottom: 'var(--space-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Calendar size={15} style={{ color: 'var(--c-accent)' }} />
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--c-text-primary)',
            }}
          >
            Activity
          </span>
        </div>
        <div
          style={{
            fontSize: '0.6875rem',
            color: 'var(--c-text-tertiary)',
          }}
        >
          <strong style={{ color: 'var(--c-text-secondary)' }}>{totalSessions}</strong>{' '}
          sessions in <strong style={{ color: 'var(--c-text-secondary)' }}>{activeDays}</strong>{' '}
          days
        </div>
      </div>

      {/* Heatmap Grid */}
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 4,
        }}
      >
        {/* Month labels row */}
        <div
          style={{
            display: 'flex',
            marginLeft: 30,
            marginBottom: 4,
            height: 14,
            position: 'relative',
          }}
        >
          {monthLabels.map(({ month, weekIdx }) => (
            <span
              key={`${month}-${weekIdx}`}
              style={{
                position: 'absolute',
                left: weekIdx * (cellSize + cellGap),
                fontSize: '0.5625rem',
                color: 'var(--c-text-tertiary)',
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              {month}
            </span>
          ))}
        </div>

        {/* Grid: day labels + cells */}
        <div style={{ display: 'flex', gap: 0 }}>
          {/* Day labels */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: cellGap,
              marginRight: 6,
              width: 22,
            }}
          >
            {['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, i) => (
              <div
                key={i}
                style={{
                  height: cellSize,
                  fontSize: '0.5625rem',
                  color: 'var(--c-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  lineHeight: 1,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div style={{ display: 'flex', gap: cellGap }}>
            {weeks.map((week, weekIdx) => (
              <div
                key={weekIdx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: cellGap,
                }}
              >
                {week.map((day, dayIdx) => {
                  if (day === null) {
                    return (
                      <div
                        key={dayIdx}
                        style={{
                          width: cellSize,
                          height: cellSize,
                        }}
                      />
                    );
                  }

                  const level = getIntensityLevel(day.count);
                  const cellId = `${weekIdx}-${dayIdx}`;
                  const isHovered = hoveredCell === cellId;

                  return (
                    <div
                      key={dayIdx}
                      onMouseEnter={() => setHoveredCell(cellId)}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderRadius: 2,
                        background: colors[level],
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        transform: isHovered ? 'scale(1.4)' : 'scale(1)',
                        boxShadow: isHovered && level > 0
                          ? '0 0 8px rgba(99, 102, 241, 0.4)'
                          : 'none',
                        position: 'relative',
                      }}
                      title={`${day.date}: ${day.count} session${day.count !== 1 ? 's' : ''} (${day.minutes} min)`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
          marginTop: 'var(--space-md)',
        }}
      >
        <span
          style={{
            fontSize: '0.5625rem',
            color: 'var(--c-text-muted)',
            marginRight: 4,
          }}
        >
          Less
        </span>
        {colors.map((color, i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: color,
            }}
          />
        ))}
        <span
          style={{
            fontSize: '0.5625rem',
            color: 'var(--c-text-muted)',
            marginLeft: 4,
          }}
        >
          More
        </span>
      </div>
    </div>
  );
}
