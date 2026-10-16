/**
 * NeuroVault — Skeleton Loading Components
 *
 * Tập hợp skeleton placeholders dùng animation shimmer CSS-only.
 * Mỗi skeleton mô phỏng hình dạng UI thực tế để tránh layout shift.
 * Không dùng thư viện bên ngoài.
 */

/**
 * Skeleton cơ bản — hình chữ nhật với shimmer.
 * @param {number} width — chiều rộng (px hoặc %)
 * @param {number} height — chiều cao (px)
 * @param {string} borderRadius — border-radius
 * @param {object} style — override styles
 */
export function Skeleton({ width, height = 16, borderRadius, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{
        width: width || '100%',
        height,
        borderRadius: borderRadius || 'var(--radius-md)',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton cho một dòng text.
 */
export function SkeletonText({ lines = 3, gap = 8 }) {
  const widths = ['100%', '92%', '78%', '85%', '60%'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={14} width={widths[i % widths.length]} borderRadius="var(--radius-sm)" />
      ))}
    </div>
  );
}

/**
 * Skeleton hình tròn (avatar).
 */
export function SkeletonCircle({ size = 40 }) {
  return <Skeleton width={size} height={size} borderRadius="50%" />;
}

/**
 * Skeleton cho card (bento-card style).
 */
export function SkeletonCard({ height = 180 }) {
  return (
    <div
      className="skeleton"
      style={{
        height,
        borderRadius: 'var(--radius-xl)',
        width: '100%',
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton cho danh sách document (list item style).
 */
export function SkeletonDocumentList({ count = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-lg)',
            padding: 'var(--space-lg)',
            background: 'var(--c-bg-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <Skeleton width={44} height={44} borderRadius="var(--radius-md)" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={16} width="60%" />
            <Skeleton height={12} width="35%" />
          </div>
          <Skeleton width={60} height={24} borderRadius="var(--radius-full)" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton cho dashboard stats grid (6 mini cards).
 */
export function SkeletonStatsGrid({ count = 6 }) {
  return (
    <div
      className="dashboard-stats-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 'var(--space-md)',
      }}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            padding: 'var(--space-lg)',
            background: 'var(--c-bg-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--radius-xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
          }}
        >
          <Skeleton height={12} width="50%" />
          <Skeleton height={24} width="40%" />
          <Skeleton height={10} width="70%" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton cho AI Studio chat area.
 */
export function SkeletonChat({ messages = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' }} aria-hidden="true">
      {Array.from({ length: messages }, (_, i) => {
        const isUser = i % 2 === 0;
        return (
          <div key={i} style={{
            display: 'flex',
            gap: 'var(--space-md)',
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            maxWidth: '70%',
          }}>
            {!isUser && <SkeletonCircle size={32} />}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton height={14} width={isUser ? '80%' : '90%'} />
              <Skeleton height={14} width={isUser ? '60%' : '75%'} />
              {!isUser && <Skeleton height={14} width="45%" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Skeleton cho quiz options.
 */
export function SkeletonQuiz() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }} aria-hidden="true">
      {/* Question */}
      <Skeleton height={24} width="85%" />
      <Skeleton height={16} width="60%" />

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
            padding: 'var(--space-md) var(--space-lg)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--c-bg-card)',
          }}>
            <Skeleton width={20} height={20} borderRadius="50%" />
            <Skeleton height={14} width={`${60 + Math.random() * 30}%`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton cho page loading toàn trang.
 */
export function SkeletonPage() {
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'var(--space-xl)' }} aria-hidden="true">
      {/* Header area */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <Skeleton height={28} width="30%" style={{ marginBottom: 8 }} />
        <Skeleton height={16} width="50%" />
      </div>

      {/* Content grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'var(--space-md)',
      }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} height={160} />
        ))}
      </div>
    </div>
  );
}
