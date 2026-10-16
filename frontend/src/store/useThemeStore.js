/**
 * NeuroVault — Theme Store (Zustand)
 * 
 * Quản lý dark/light mode với persistence vào localStorage.
 * Tự động phát hiện system preference nếu chưa có setting.
 * Áp dụng class 'dark' lên <html> element để CSS variables chuyển theme.
 */
import { create } from 'zustand';

const STORAGE_KEY = 'neurovault-theme';

/**
 * Đọc theme preference từ localStorage hoặc system preference
 * @returns {'dark' | 'light'}
 */
function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage không khả dụng (incognito, etc.)
  }
  
  // Fallback: system preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  return 'dark'; // Default dark-first design
}

/**
 * Áp dụng theme class lên document
 * @param {'dark' | 'light'} theme 
 */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
  
  // Cập nhật meta theme-color cho mobile browsers
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#0a0a12' : '#f8fafc');
  }
}

// Áp dụng theme ngay khi module load (tránh flash)
const initialTheme = getInitialTheme();
if (typeof document !== 'undefined') {
  applyTheme(initialTheme);
}

const useThemeStore = create((set, get) => ({
  // ── State ──
  theme: initialTheme,
  
  // ── Actions ──
  
  /** Toggle giữa dark và light */
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    set({ theme: next });
  },
  
  /** Set theme cụ thể */
  setTheme: (theme) => {
    if (theme !== 'dark' && theme !== 'light') return;
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    set({ theme });
  },
  
  /** Kiểm tra có đang dark mode không */
  isDark: () => get().theme === 'dark',
}));

// Lắng nghe system preference thay đổi (realtime)
if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', (e) => {
    // Chỉ auto-switch nếu user chưa chọn manual
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const newTheme = e.matches ? 'dark' : 'light';
      applyTheme(newTheme);
      useThemeStore.setState({ theme: newTheme });
    }
  });
}

export default useThemeStore;
