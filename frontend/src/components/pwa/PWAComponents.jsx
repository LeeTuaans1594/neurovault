import { useEffect } from 'react';
import { WifiOff, RefreshCw, Download, X, Wifi } from 'lucide-react';
import useOfflineStore from '../../store/useOfflineStore';

/**
 * OfflineBanner — Shows when user loses connectivity.
 * Auto-hides when back online.
 */
export function OfflineBanner() {
  const isOnline = useOfflineStore(s => s.isOnline);
  const wasOffline = useOfflineStore(s => s.wasOffline);
  const pendingCount = useOfflineStore(s => s.pendingActions.length);

  if (isOnline && !wasOffline) return null;

  // Just came back online
  if (isOnline && wasOffline) {
    return (
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 'var(--radius-full)',
        background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)',
        backdropFilter: 'blur(12px)', zIndex: 9999,
        animation: 'fadeInUp 0.4s var(--ease-out-expo)',
        fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-success)',
      }}>
        <Wifi size={14} />
        Back online{pendingCount > 0 ? ` — syncing ${pendingCount} actions` : ''}
      </div>
    );
  }

  // Offline
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 20px', borderRadius: 'var(--radius-full)',
      background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)',
      backdropFilter: 'blur(12px)', zIndex: 9999,
      animation: 'fadeInUp 0.4s var(--ease-out-expo)',
      fontSize: '0.8125rem', fontWeight: 500, color: '#fbbf24',
    }}>
      <WifiOff size={14} />
      You're offline — cached content available
    </div>
  );
}

/**
 * UpdateToast — Shows when a new version of the app is available.
 */
export function UpdateToast() {
  const updateAvailable = useOfflineStore(s => s.updateAvailable);
  const applyUpdate = useOfflineStore(s => s.applyUpdate);
  const dismissUpdate = useOfflineStore(s => s.dismissUpdate);

  if (!updateAvailable) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderRadius: 'var(--radius-lg)',
      background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
      boxShadow: 'var(--shadow-xl)', zIndex: 9999,
      animation: 'fadeInUp 0.4s var(--ease-out-expo)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--radius-md)',
        background: 'var(--c-accent-glow)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <RefreshCw size={16} style={{ color: 'var(--c-accent)' }} />
      </div>
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
          Update available
        </div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>
          A new version of NeuroVault is ready
        </div>
      </div>
      <button onClick={applyUpdate} style={{
        padding: '6px 14px', borderRadius: 'var(--radius-md)', border: 'none',
        background: 'var(--c-accent-gradient)', color: '#fff', cursor: 'pointer',
        fontSize: '0.75rem', fontWeight: 600,
      }}>
        Update
      </button>
      <button onClick={dismissUpdate} style={{
        width: 24, height: 24, borderRadius: 'var(--radius-sm)',
        border: 'none', background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--c-text-muted)',
      }}>
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * InstallButton — PWA "Add to Home Screen" prompt.
 * Only shows when installPrompt is available and app not yet installed.
 */
export function InstallButton({ variant = 'inline' }) {
  const installPrompt = useOfflineStore(s => s.installPrompt);
  const isInstalled = useOfflineStore(s => s.isInstalled);
  const triggerInstall = useOfflineStore(s => s.triggerInstall);

  if (!installPrompt || isInstalled) return null;

  if (variant === 'banner') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderRadius: 'var(--radius-lg)',
        background: 'var(--c-accent-glow)', border: '1px solid rgba(99,102,241,0.2)',
        marginBottom: 'var(--space-md)',
      }}>
        <Download size={16} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
            Install NeuroVault
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>
            Add to your home screen for quick access
          </div>
        </div>
        <button onClick={triggerInstall} className="btn btn-primary btn-sm">
          Install
        </button>
      </div>
    );
  }

  return (
    <button onClick={triggerInstall} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
      <Download size={13} /> Install App
    </button>
  );
}

/**
 * PWAProvider — Initializes all PWA listeners.
 * Place in App root.
 */
export function PWAProvider({ children }) {
  const initListeners = useOfflineStore(s => s.initListeners);

  useEffect(() => {
    const cleanup = initListeners();
    return cleanup;
  }, [initListeners]);

  return (
    <>
      {children}
      <OfflineBanner />
      <UpdateToast />
    </>
  );
}
