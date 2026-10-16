/**
 * NeuroVault — Toast Notification System
 *
 * Hệ thống toast thông báo toàn cục.
 * Sử dụng: import { useToast, ToastProvider } từ file này.
 *
 * Không dùng thư viện bên ngoài — 100% tự viết.
 * Hỗ trợ 4 loại: success, error, warning, info.
 * Auto-dismiss + dismissable + stacking.
 */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Toast Context ──
const ToastContext = createContext(null);

/**
 * Hook sử dụng toast.
 * @returns {{ toast: (msg, opts) => void, success: (msg) => void, error: (msg) => void, warning: (msg) => void, info: (msg) => void }}
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback nếu không có Provider — log ra console
    return {
      toast: (msg) => console.log('[Toast]', msg),
      success: (msg) => console.log('[Toast:success]', msg),
      error: (msg) => console.error('[Toast:error]', msg),
      warning: (msg) => console.warn('[Toast:warning]', msg),
      info: (msg) => console.info('[Toast:info]', msg),
    };
  }
  return ctx;
}

// ── Toast Item Icons ──
const TOAST_ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_COLORS = {
  success: { text: 'var(--c-success)', bg: 'var(--c-success-glow)', border: 'rgba(52, 211, 153, 0.2)' },
  error: { text: 'var(--c-error)', bg: 'var(--c-error-glow)', border: 'rgba(248, 113, 113, 0.2)' },
  warning: { text: '#f59e0b', bg: 'var(--c-warning-glow)', border: 'rgba(245, 158, 11, 0.2)' },
  info: { text: 'var(--c-accent)', bg: 'var(--c-accent-glow)', border: 'rgba(99, 102, 241, 0.2)' },
};

// ── Single Toast Item ──
function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);
  const Icon = TOAST_ICONS[toast.type] || Info;
  const colors = TOAST_COLORS[toast.type] || TOAST_COLORS.info;

  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, toast.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`toast-item ${exiting ? 'toast-exit' : 'toast-enter'}`}
      role="alert"
      aria-live="polite"
      style={{
        background: 'var(--c-bg-card)',
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.text}`,
        borderRadius: 'var(--radius-md)',
        padding: '0.875rem 1rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-md)',
        boxShadow: 'var(--shadow-lg)',
        minWidth: 320,
        maxWidth: 420,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Icon
        size={18}
        strokeWidth={2}
        style={{ color: colors.text, flexShrink: 0, marginTop: 1 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--c-text-primary)',
            marginBottom: 2,
          }}>
            {toast.title}
          </div>
        )}
        <div style={{
          fontSize: '0.8125rem',
          color: 'var(--c-text-secondary)',
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}>
          {toast.message}
        </div>
      </div>
      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--c-text-tertiary)',
          padding: 2,
          borderRadius: 'var(--radius-sm)',
          flexShrink: 0,
          transition: 'color var(--duration-fast)',
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>

      {/* Auto-dismiss progress bar */}
      {toast.duration > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 2,
          background: colors.text,
          opacity: 0.4,
          animation: `toast-timer ${toast.duration}ms linear forwards`,
        }} />
      )}
    </div>
  );
}

// ── Counter for unique IDs ──
let toastCounter = 0;

/**
 * ToastProvider — bọc quanh App để cung cấp toast API.
 */
export function ToastProvider({ children, maxToasts = 5 }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message, options = {}) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const newToast = {
      id,
      message,
      type: options.type || 'info',
      title: options.title || null,
      duration: options.duration ?? 5000, // 5 giây mặc định
    };

    setToasts(prev => {
      const updated = [...prev, newToast];
      // Giữ tối đa maxToasts
      if (updated.length > maxToasts) {
        return updated.slice(updated.length - maxToasts);
      }
      return updated;
    });

    return id;
  }, [maxToasts]);

  // Shorthand methods
  const api = useCallback(() => ({
    toast: (msg, opts) => addToast(msg, opts),
    success: (msg, opts) => addToast(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => addToast(msg, { ...opts, type: 'error' }),
    warning: (msg, opts) => addToast(msg, { ...opts, type: 'warning' }),
    info: (msg, opts) => addToast(msg, { ...opts, type: 'info' }),
  }), [addToast]);

  return (
    <ToastContext.Provider value={api()}>
      {children}

      {/* Toast Container — fixed top-right */}
      {toasts.length > 0 && (
        <div
          className="toast-container"
          style={{
            position: 'fixed',
            top: 'calc(var(--header-height, 64px) + var(--space-md))',
            right: 'var(--space-lg)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
            pointerEvents: 'none',
          }}
        >
          {toasts.map(toast => (
            <div key={toast.id} style={{ pointerEvents: 'auto' }}>
              <ToastItem toast={toast} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export default ToastProvider;
