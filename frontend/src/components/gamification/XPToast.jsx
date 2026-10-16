import { useEffect, useState } from 'react';
import { Zap, Award, ChevronUp } from 'lucide-react';
import useGamificationStore from '../../store/useGamificationStore';

/**
 * XPToast — Animated popup khi nhận XP.
 * Hiển thị ở bottom-right, auto-dismiss sau 3.5s.
 * Renders từ global store.
 */
export default function XPToastContainer() {
  const { xpToasts } = useGamificationStore();

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      pointerEvents: 'none',
    }}>
      {xpToasts.map(toast => (
        <XPToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function XPToastItem({ toast }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setShow(true));
    // Start exit
    const timer = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const actionLabels = {
    complete_quiz: 'Quiz completed',
    review_flashcard: 'Cards reviewed',
    chat_message: 'Chat message',
    upload_document: 'Document uploaded',
    daily_login: 'Daily login',
    daily_challenge: 'Challenge completed!',
    reading_session: 'Reading session',
  };

  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'var(--c-bg-card)',
      border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: 'var(--radius-lg)',
      padding: '0.75rem 1rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 0 20px rgba(99,102,241,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      minWidth: 220,
      transform: show ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)',
      opacity: show ? 1 : 0,
      transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      {/* XP Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        animation: show ? 'pulse-glow 1s ease-in-out' : 'none',
      }}>
        <Zap size={16} color="#fff" strokeWidth={2.5} />
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '0.9375rem', fontWeight: 700, color: 'var(--c-accent)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          +{toast.amount} XP
        </div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>
          {actionLabels[toast.action] || toast.action}
        </div>
      </div>

      {/* Level up indicator */}
      {toast.leveledUp && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'rgba(16,185,129,0.1)',
          color: 'var(--c-success)',
          padding: '3px 8px', borderRadius: 'var(--radius-full)',
          fontSize: '0.625rem', fontWeight: 700,
        }}>
          <ChevronUp size={10} />
          LEVEL UP!
        </div>
      )}

      {/* New badges */}
      {toast.newBadges?.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {toast.newBadges.map(b => (
            <span key={b.badge_id} style={{
              fontSize: '1.25rem',
              animation: 'float 2s ease-in-out infinite',
            }}>
              {b.icon}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
