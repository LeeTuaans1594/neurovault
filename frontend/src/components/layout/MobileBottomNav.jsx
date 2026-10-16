/**
 * NeuroVault — Mobile Bottom Navigation
 *
 * Bottom tab bar hiển thị trên mobile (≤768px) qua CSS.
 * Auto-hide khi cuộn xuống, hiện khi cuộn lên (iOS-style).
 * Safe area inset support cho notch devices.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid, FileText, Brain, Network, User,
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Dashboard', icon: LayoutGrid, path: '/dashboard' },
  { name: 'Documents', icon: FileText, path: '/documents' },
  { name: 'AI Studio', icon: Brain, path: '/ai-studio' },
  { name: 'Graph', icon: Network, path: '/knowledge-graph' },
  { name: 'Profile', icon: User, path: '/profile' },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  // ── Auto-hide khi scroll xuống, hiện khi scroll lên ──
  const handleScroll = useCallback((e) => {
    if (!ticking.current) {
      window.requestAnimationFrame(() => {
        const target = e?.target;
        const currentScrollY = target?.scrollTop ?? window.scrollY;
        const delta = currentScrollY - lastScrollY.current;

        // Chỉ ẩn khi scroll xuống > 10px và đang không ở đầu trang
        if (delta > 10 && currentScrollY > 80) {
          setVisible(false);
        } else if (delta < -5) {
          setVisible(true);
        }

        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
      ticking.current = true;
    }
  }, []);

  useEffect(() => {
    // Lắng nghe scroll event trên .app-content container
    const mainEl = document.querySelector('.app-content');
    if (!mainEl) return;

    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Luôn hiện khi chuyển route
  useEffect(() => {
    setVisible(true);
    lastScrollY.current = 0;
  }, [location.pathname]);

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
      }}
      aria-label="Mobile navigation"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = location.pathname.startsWith(item.path);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="mobile-nav-icon-wrap">
              <item.icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.5}
              />
              {isActive && <div className="mobile-nav-indicator" />}
            </div>
            <span className="mobile-nav-label">{item.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
