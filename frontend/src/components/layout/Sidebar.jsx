/**
 * NeuroVault — Sidebar Navigation
 *
 * Desktop (>768px): luôn hiển thị bên trái, width cố định.
 * Mobile (≤768px): overlay trượt từ trái, có backdrop close.
 * Props:
 *   isOpen  — boolean, điều khiển overlay trên mobile.
 *   onClose — callback đóng sidebar khi chọn menu item trên mobile.
 */
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, FileText, Brain, Network, BarChart3, BookOpen, ScanLine, Download, User, Sparkles, ChevronRight, X } from 'lucide-react';
import useI18nStore from '../../store/useI18nStore';

const menuItems = [
  { i18nKey: 'sidebar.dashboard', icon: LayoutGrid, path: '/dashboard' },
  { i18nKey: 'sidebar.documents', icon: FileText, path: '/documents' },
  { i18nKey: 'sidebar.aiStudio', icon: Brain, path: '/ai-studio' },
  { i18nKey: 'sidebar.knowledgeGraph', icon: Network, path: '/knowledge-graph' },
  { i18nKey: 'sidebar.analytics', icon: BarChart3, path: '/analytics' },
  { i18nKey: 'sidebar.library', icon: BookOpen, path: '/library' },
  { i18nKey: 'sidebar.ocr', icon: ScanLine, path: '/ocr' },
  { i18nKey: 'sidebar.export', icon: Download, path: '/export' },
  { i18nKey: 'sidebar.profile', icon: User, path: '/profile' },
];

export default function Sidebar({ isOpen = false, onClose }) {
  const location = useLocation();
  const t = useI18nStore(s => s.t);

  const handleNavClick = () => {
    // Đóng sidebar trên mobile khi chọn menu item
    if (onClose && window.innerWidth <= 768) {
      onClose();
    }
  };

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Sparkles size={20} color="white" strokeWidth={2.5} />
        </div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">{t('sidebar.brand')}</div>
          <div className="sidebar-brand-sub">{t('sidebar.tagline')}</div>
        </div>
        {/* Nút đóng chỉ hiện trên mobile */}
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close sidebar">
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const label = t(item.i18nKey);
          return (
            <NavLink
              key={item.i18nKey}
              to={item.path}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              {isActive && <div className="sidebar-active-indicator" />}
              <item.icon
                size={18}
                strokeWidth={isActive ? 2 : 1.5}
                className="sidebar-nav-icon"
              />
              <span>{label}</span>
              {isActive && <ChevronRight size={14} className="sidebar-nav-chevron" />}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom — Version Badge */}
      <div className="sidebar-footer">
        <div className="sidebar-version">
          <div className="sidebar-version-dot" />
          <span>v1.0 — White-Box AI</span>
        </div>
      </div>
    </aside>
  );
}
