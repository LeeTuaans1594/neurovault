import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import GoogleCallback from './pages/GoogleCallback';
import useAuthStore from './store/useAuthStore';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Sparkles } from 'lucide-react';
import XPToastContainer from './components/gamification/XPToast';
import { PWAProvider } from './components/pwa/PWAComponents';

// ═══ LAZY-LOADED PAGES — Route-based code splitting ═══
// Dashboard loads eagerly (first page), all others lazy
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const AIStudioPage = lazy(() => import('./pages/AIStudioPage'));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'));
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraphPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const OCRPage = lazy(() => import('./pages/OCRPage'));
const ExportPage = lazy(() => import('./pages/ExportPage'));
const Profile = lazy(() => import('./pages/Profile'));

// ═══ Route Loading Spinner (lightweight) ═══
function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      gap: 'var(--space-md)',
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--c-accent-gradient)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pulse-glow 1.5s ease-in-out infinite',
      }}>
        <Sparkles size={18} color="white" strokeWidth={2} />
      </div>
    </div>
  );
}

// ═══ DEV BYPASS: Set true to skip login ═══
const DEV_BYPASS_AUTH = import.meta.env.DEV;

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  // ═══ DEV MODE: Skip auth, inject mock user ═══
  if (DEV_BYPASS_AUTH) {
    const store = useAuthStore.getState();
    if (!store.user) {
      useAuthStore.setState({
        user: {
          _id: 'dev-user-001',
          name: 'NeuroVault Dev',
          email: 'dev@neurovault.ai',
          avatar: 'N',
          role: 'admin',
          neural_profile: {
            learning_velocity: 1.25,
            total_concepts_mastered: 42,
            total_study_time_minutes: 1260,
          },
        },
        isAuthenticated: true,
        isLoading: false,
      });
    }
    return children;
  }

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--c-bg-primary)',
        flexDirection: 'column',
        gap: 'var(--space-lg)',
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-xl)',
          background: 'var(--c-accent-gradient)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulse-glow 2s ease-in-out infinite',
        }}>
          <Sparkles size={24} color="white" strokeWidth={2} />
        </div>
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--c-text-tertiary)',
          fontWeight: 500,
        }}>
          Initializing NeuroVault...
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <ErrorBoundary>
      <PWAProvider>
        <ToastProvider maxToasts={5}>
          <BrowserRouter>
            <XPToastContainer />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></ErrorBoundary>
              } />
              <Route path="documents" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><DocumentsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="documents/:id" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><DocumentDetail /></Suspense></ErrorBoundary>
              } />
              <Route path="ai-studio" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><AIStudioPage /></Suspense></ErrorBoundary>
              } />
              <Route path="knowledge-graph" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><KnowledgeGraphPage /></Suspense></ErrorBoundary>
              } />
              <Route path="analytics" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><AnalyticsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="library" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><LibraryPage /></Suspense></ErrorBoundary>
              } />
              <Route path="ocr" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><OCRPage /></Suspense></ErrorBoundary>
              } />
              <Route path="export" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><ExportPage /></Suspense></ErrorBoundary>
              } />
              <Route path="profile" element={
                <ErrorBoundary minimal><Suspense fallback={<PageLoader />}><Profile /></Suspense></ErrorBoundary>
              } />
            </Route>
          </Routes>
          </BrowserRouter>
        </ToastProvider>
      </PWAProvider>
    </ErrorBoundary>
  );
}

export default App;
