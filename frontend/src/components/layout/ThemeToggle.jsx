/**
 * ThemeToggle — Nút chuyển Dark/Light mode
 * 
 * Animated sun/moon icon với smooth rotation transition.
 * Dùng CSS variables nên tương thích mọi theme.
 */
import useThemeStore from '../../store/useThemeStore';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <button
      id="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label={isDark ? 'Chuyển sang Light Mode' : 'Chuyển sang Dark Mode'}
      title={isDark ? 'Light Mode' : 'Dark Mode'}
      style={{
        position: 'relative',
        width: 38,
        height: 38,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--c-border)',
        background: 'var(--c-bg-card)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isDark ? '#fbbf24' : 'var(--c-text-secondary)',
        transition: 'all var(--duration-normal) var(--ease-out-expo)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-xs)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--c-border-hover)';
        e.currentTarget.style.background = 'var(--c-bg-secondary)';
        e.currentTarget.style.transform = 'scale(1.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--c-border)';
        e.currentTarget.style.background = 'var(--c-bg-card)';
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <div style={{
        transition: 'transform var(--duration-normal) var(--ease-spring), opacity var(--duration-fast)',
        transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(180deg) scale(0)',
        position: 'absolute',
        opacity: isDark ? 1 : 0,
      }}>
        <Moon size={16} strokeWidth={2} />
      </div>
      <div style={{
        transition: 'transform var(--duration-normal) var(--ease-spring), opacity var(--duration-fast)',
        transform: isDark ? 'rotate(-180deg) scale(0)' : 'rotate(0deg) scale(1)',
        position: 'absolute',
        opacity: isDark ? 0 : 1,
      }}>
        <Sun size={16} strokeWidth={2} />
      </div>
    </button>
  );
}
