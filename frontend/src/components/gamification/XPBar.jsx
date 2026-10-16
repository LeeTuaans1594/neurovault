import { useState, useEffect } from 'react';
import { Zap, ChevronUp } from 'lucide-react';

/**
 * XPBar — Thanh XP ngang hiển thị level, XP progress, tier badge.
 * Dùng trên Dashboard header.
 */
export default function XPBar({ profile }) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    // Animate progress bar on mount
    const timer = setTimeout(() => {
      setAnimatedProgress(profile?.progressToNextLevel || 0);
    }, 100);
    return () => clearTimeout(timer);
  }, [profile?.progressToNextLevel]);

  if (!profile) return null;

  const tierColors = {
    Bronze: { bg: 'linear-gradient(135deg, #cd7f32, #a0522d)', text: '#cd7f32', glow: 'rgba(205,127,50,0.2)' },
    Silver: { bg: 'linear-gradient(135deg, #c0c0c0, #8a8a8a)', text: '#b0b0b0', glow: 'rgba(192,192,192,0.2)' },
    Gold: { bg: 'linear-gradient(135deg, #ffd700, #daa520)', text: '#ffd700', glow: 'rgba(255,215,0,0.2)' },
    Platinum: { bg: 'linear-gradient(135deg, #a8d8ea, #73b4d4)', text: '#73b4d4', glow: 'rgba(115,180,212,0.2)' },
    Diamond: { bg: 'linear-gradient(135deg, #b9f2ff, #4fc3f7)', text: '#4fc3f7', glow: 'rgba(79,195,247,0.3)' },
  };

  const tier = tierColors[profile.tier] || tierColors.Bronze;

  return (
    <div className="bento-card" style={{
      padding: '1rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    }}>
      {/* Level Circle */}
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: tier.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `0 0 20px ${tier.glow}`,
        position: 'relative',
      }}>
        <span style={{
          fontSize: '1.125rem', fontWeight: 800, color: '#fff',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}>
          {profile.level}
        </span>
      </div>

      {/* XP Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} style={{ color: tier.text }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
              {profile.xp?.toLocaleString()} XP
            </span>
            <span style={{
              fontSize: '0.625rem', fontWeight: 700, color: tier.text,
              background: tier.glow, padding: '2px 8px', borderRadius: 'var(--radius-full)',
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              {profile.tier}
            </span>
          </div>
          <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>
            {profile.xpForNextLevel?.toLocaleString()} XP → Lv.{profile.level + 1}
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{
          height: 6, borderRadius: 3,
          background: 'var(--c-bg-tertiary)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: tier.bg,
            width: `${animatedProgress}%`,
            transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: `0 0 8px ${tier.glow}`,
          }} />
        </div>
      </div>
    </div>
  );
}
