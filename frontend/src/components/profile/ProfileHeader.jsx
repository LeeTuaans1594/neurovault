/**
 * ProfileHeader — Avatar lớn + gradient ring + tên + role badge + join date
 * Hiển thị thông tin cá nhân nổi bật ở đầu trang Profile v2
 */
import { Shield, Calendar, Zap } from 'lucide-react';

export default function ProfileHeader({ user, joinDate, neuralProfile }) {
  // Format join date
  const formattedJoinDate = joinDate
    ? new Date(joinDate).toLocaleDateString('vi-VN', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'N/A';

  // Tính level từ learning velocity
  const velocity = neuralProfile?.learning_velocity || 1.0;
  const levelLabel = velocity >= 2.0 ? 'Expert' : velocity >= 1.5 ? 'Advanced' : velocity >= 1.1 ? 'Intermediate' : 'Beginner';
  const levelColor = velocity >= 2.0 ? '#34d399' : velocity >= 1.5 ? '#818cf8' : velocity >= 1.1 ? '#fbbf24' : 'var(--c-text-tertiary)';

  return (
    <div className="bento-card profile-header-inner" style={{
      padding: 'var(--space-2xl)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xl)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Gradient background effect */}
      <div style={{
        position: 'absolute',
        top: -60, right: -60,
        width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
      }} />

      {/* Avatar with gradient ring */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 96, height: 96,
          borderRadius: 'var(--radius-2xl)',
          background: 'var(--c-accent-gradient)',
          padding: 3,
          boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
        }}>
          <div style={{
            width: '100%', height: '100%',
            borderRadius: 'calc(var(--radius-2xl) - 3px)',
            background: 'var(--c-bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            fontWeight: 800,
            color: 'var(--c-accent)',
          }}>
            {user?.avatar || user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
        </div>
        {/* Online indicator */}
        <div style={{
          position: 'absolute',
          bottom: 4, right: 4,
          width: 16, height: 16,
          borderRadius: '50%',
          background: '#34d399',
          border: '3px solid var(--c-bg-card)',
          boxShadow: '0 0 8px rgba(52, 211, 153, 0.4)',
        }} />
      </div>

      {/* User Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '1.5rem', fontWeight: 700,
          color: 'var(--c-text-primary)',
          letterSpacing: '-0.02em',
          marginBottom: 4,
        }}>
          {user?.name || 'User'}
        </div>
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--c-text-tertiary)',
          marginBottom: 'var(--space-sm)',
        }}>
          {user?.email || 'user@example.com'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          {/* Role badge */}
          <div className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
            <Shield size={12} />
            {user?.role === 'admin' ? 'Admin' : 'Member'}
          </div>
          {/* Join date */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: '0.8125rem', color: 'var(--c-text-tertiary)',
          }}>
            <Calendar size={13} />
            Joined {formattedJoinDate}
          </div>
          {/* Level badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: '0.75rem', fontWeight: 600,
            color: levelColor,
            background: `${levelColor}18`,
            padding: '0.2rem 0.6rem',
            borderRadius: 'var(--radius-full)',
          }}>
            <Zap size={12} />
            {levelLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
