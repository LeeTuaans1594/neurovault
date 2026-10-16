/**
 * PreferencesCard — Theme toggle, language, notifications
 * Lưu preferences vào localStorage, apply ngay qua Zustand hoặc CSS class
 */
import { useState, useEffect } from 'react';
import { Moon, Sun, Globe, Bell, Monitor } from 'lucide-react';

export default function PreferencesCard() {
  // ── Theme ──
  const [theme, setTheme] = useState(() => localStorage.getItem('neurovault_theme') || 'dark');
  // ── Language ──
  const [lang, setLang] = useState(() => localStorage.getItem('neurovault_lang') || 'en');
  // ── Notifications ──
  const [notifReview, setNotifReview] = useState(() => localStorage.getItem('neurovault_notif_review') !== 'false');
  const [notifStreak, setNotifStreak] = useState(() => localStorage.getItem('neurovault_notif_streak') !== 'false');

  // Apply theme
  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('neurovault_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('neurovault_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('neurovault_notif_review', notifReview);
  }, [notifReview]);

  useEffect(() => {
    localStorage.setItem('neurovault_notif_streak', notifStreak);
  }, [notifStreak]);

  const themeOptions = [
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'light', icon: Sun, label: 'Light' },
  ];

  const ToggleSwitch = ({ checked, onChange, id }) => (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24,
        borderRadius: 'var(--radius-full)',
        background: checked ? 'var(--c-accent)' : 'var(--c-bg-tertiary)',
        border: `1px solid ${checked ? 'transparent' : 'var(--c-border)'}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all var(--duration-normal) var(--ease-out-expo)',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18,
        borderRadius: '50%',
        background: 'white',
        position: 'absolute',
        top: 2,
        left: checked ? 22 : 3,
        transition: 'left var(--duration-normal) var(--ease-spring)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );

  return (
    <div className="bento-card" style={{ padding: 'var(--space-xl)' }}>
      <h3 style={{
        fontSize: '1rem', fontWeight: 600,
        color: 'var(--c-text-primary)',
        marginBottom: 'var(--space-lg)',
      }}>
        Preferences
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {/* Theme selector */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 'var(--space-sm)',
          }}>
            <Monitor size={15} color="var(--c-text-tertiary)" />
            <span style={{
              fontSize: '0.8125rem', fontWeight: 500,
              color: 'var(--c-text-secondary)',
            }}>
              Theme
            </span>
          </div>
          <div style={{
            display: 'flex', gap: 'var(--space-sm)',
          }}>
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const isActive = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  id={`theme-${opt.value}`}
                  onClick={() => setTheme(opt.value)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '0.625rem',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isActive ? 'var(--c-accent)' : 'var(--c-border)'}`,
                    background: isActive ? 'var(--c-accent-glow)' : 'var(--c-bg-tertiary)',
                    color: isActive ? 'var(--c-accent)' : 'var(--c-text-tertiary)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    fontWeight: isActive ? 600 : 400,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all var(--duration-normal) var(--ease-out-expo)',
                  }}
                >
                  <Icon size={15} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--c-border)' }} />

        {/* Language selector */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 'var(--space-sm)',
          }}>
            <Globe size={15} color="var(--c-text-tertiary)" />
            <span style={{
              fontSize: '0.8125rem', fontWeight: 500,
              color: 'var(--c-text-secondary)',
            }}>
              Language
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {[
              { value: 'en', label: '🇬🇧 English' },
              { value: 'vi', label: '🇻🇳 Tiếng Việt' },
            ].map((opt) => {
              const isActive = lang === opt.value;
              return (
                <button
                  key={opt.value}
                  id={`lang-${opt.value}`}
                  onClick={() => setLang(opt.value)}
                  style={{
                    flex: 1,
                    padding: '0.625rem',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isActive ? 'var(--c-accent)' : 'var(--c-border)'}`,
                    background: isActive ? 'var(--c-accent-glow)' : 'var(--c-bg-tertiary)',
                    color: isActive ? 'var(--c-accent)' : 'var(--c-text-tertiary)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    fontWeight: isActive ? 600 : 400,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all var(--duration-normal) var(--ease-out-expo)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--c-border)' }} />

        {/* Notifications */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 'var(--space-md)',
          }}>
            <Bell size={15} color="var(--c-text-tertiary)" />
            <span style={{
              fontSize: '0.8125rem', fontWeight: 500,
              color: 'var(--c-text-secondary)',
            }}>
              Notifications
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-primary)', fontWeight: 500 }}>
                  Review Reminders
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)' }}>
                  Notify when flashcards are due
                </div>
              </div>
              <ToggleSwitch checked={notifReview} onChange={setNotifReview} id="toggle-review-notif" />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-primary)', fontWeight: 500 }}>
                  Streak Alerts
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)' }}>
                  Remind to maintain daily streak
                </div>
              </div>
              <ToggleSwitch checked={notifStreak} onChange={setNotifStreak} id="toggle-streak-notif" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
