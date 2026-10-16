import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { Sparkles } from 'lucide-react';

/**
 * Google OAuth Callback Handler
 * Receives tokens from URL params after Google redirect,
 * stores them, and navigates to dashboard.
 */
export default function GoogleCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTokensFromGoogle } = useAuthStore();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const error = searchParams.get('error');

    if (error) {
      navigate('/login?error=google_auth_failed');
      return;
    }

    if (accessToken && refreshToken) {
      setTokensFromGoogle(accessToken, refreshToken);
      navigate('/dashboard');
    } else {
      navigate('/login?error=missing_tokens');
    }
  }, [searchParams, navigate, setTokensFromGoogle]);

  return (
    <div className="noise-overlay" style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--c-bg-primary)',
      flexDirection: 'column',
      gap: 'var(--space-lg)',
    }}>
      <div className="ambient-bg">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
      </div>
      <div style={{
        width: 56, height: 56,
        borderRadius: 'var(--radius-xl)',
        background: 'var(--c-accent-gradient)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse-glow 2s ease-in-out infinite',
        position: 'relative', zIndex: 1,
      }}>
        <Sparkles size={24} color="white" strokeWidth={2} />
      </div>
      <div style={{
        fontSize: '0.9375rem', color: 'var(--c-text-secondary)',
        fontWeight: 500, position: 'relative', zIndex: 1,
      }}>
        Completing Google sign-in...
      </div>
    </div>
  );
}
