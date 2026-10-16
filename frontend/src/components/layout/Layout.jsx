import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

/**
 * Layout — Shell chính của ứng dụng.
 * Desktop: Sidebar trái + Header trên + Content.
 * Mobile (≤768px): Header có hamburger, sidebar overlay, bottom nav.
 */
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="app-layout">
      {/* Soft ambient background */}
      <div className="ambient-bg">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
      </div>

      {/* Mobile overlay backdrop — click to close sidebar */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay animate-fade-in"
          onClick={closeSidebar}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar — desktop: always visible, mobile: overlay */}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="app-main">
        <Header onMenuToggle={toggleSidebar} />
        <main className="app-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation — only visible ≤768px via CSS */}
      <MobileBottomNav />
    </div>
  );
}
