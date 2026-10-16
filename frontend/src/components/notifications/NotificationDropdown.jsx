import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useNotificationStore from '../../store/useNotificationStore';

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, loadNotifications, loadUnreadCount, markRead, markAllRead, deleteNotification, connectSSE, disconnectSSE } = useNotificationStore();

  useEffect(() => {
    loadUnreadCount();
    connectSSE();
    return () => disconnectSSE();
  }, []);

  useEffect(() => {
    if (isOpen) loadNotifications();
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = (notif) => {
    if (!notif.read) markRead(notif._id);
    if (notif.actionUrl) { navigate(notif.actionUrl); setIsOpen(false); }
  };

  const timeAgo = (date) => {
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button className="header-icon-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Notifications" style={{ position: 'relative' }}>
        <Bell size={16} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16,
            borderRadius: 'var(--radius-full)', background: '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.5625rem', fontWeight: 700, color: '#fff',
            border: '2px solid var(--c-bg-card)', padding: '0 3px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="animate-fade-in" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 360, maxHeight: 460, borderRadius: 'var(--radius-xl)',
          background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
          boxShadow: 'var(--shadow-xl)', overflow: 'hidden', zIndex: 100,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--c-border)',
          }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>
              Notifications {unreadCount > 0 && <span style={{ color: 'var(--c-accent)', fontSize: '0.75rem' }}>({unreadCount})</span>}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {unreadCount > 0 && (
                <button onClick={markAllRead} title="Mark all read" style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: 'var(--c-text-tertiary)', borderRadius: 'var(--radius-sm)',
                }} onMouseEnter={e => e.target.style.color = 'var(--c-accent)'}
                   onMouseLeave={e => e.target.style.color = 'var(--c-text-tertiary)'}>
                  <CheckCheck size={14} />
                </button>
              )}
              <button onClick={() => setIsOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: 'var(--c-text-tertiary)', borderRadius: 'var(--radius-sm)',
              }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--c-text-muted)', fontSize: '0.8125rem' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div key={n._id} onClick={() => handleClick(n)} style={{
                  display: 'flex', gap: 10, padding: '10px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--c-border)',
                  background: n.read ? 'transparent' : 'rgba(99,102,241,0.03)',
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(99,102,241,0.03)'}
                >
                  {/* Icon */}
                  <span style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: 2 }}>{n.icon}</span>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{
                        fontSize: '0.8125rem', fontWeight: n.read ? 400 : 600,
                        color: 'var(--c-text-primary)', lineHeight: 1.3,
                      }}>{n.title}</span>
                      <span style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)', flexShrink: 0, marginLeft: 8 }}>
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.message && (
                      <p style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', marginTop: 2, lineHeight: 1.4 }}>
                        {n.message}
                      </p>
                    )}
                  </div>
                  {/* Unread dot */}
                  {!n.read && (
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-accent)', flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
