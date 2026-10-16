import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { Mail, Lock, ArrowRight, Sparkles, Brain, Layers, Zap, Network } from 'lucide-react';
import ThemeToggle from '../components/layout/ThemeToggle';

export default function Login() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    clearError();
    const result = await login(email, password);
    if (result.success) {
      navigate('/dashboard');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'var(--c-bg-primary)',
      position: 'relative',
    }}>
      {/* Theme Toggle — góc trên phải */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
        <ThemeToggle />
      </div>
      {/* Left — Visual Panel */}
      <div className="login-visual-panel" style={{
        flex: 1, display: 'none', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -120, left: -60, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', top: '40%', right: '10%', width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        <div style={{
          position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', height: '100%', padding: '3rem',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 'var(--space-xl)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
          }}>
            <Sparkles size={32} color="white" strokeWidth={2} />
          </div>
          <h1 style={{
            fontSize: '2.5rem', fontWeight: 800, color: 'white',
            textAlign: 'center', lineHeight: 1.2, letterSpacing: '-0.03em',
            marginBottom: 'var(--space-lg)', maxWidth: 480,
          }}>
            Accelerate your learning with <span style={{ color: 'rgba(255,255,255,0.9)' }}>AI intelligence</span>
          </h1>
          <p style={{
            fontSize: '1.0625rem', color: 'rgba(255,255,255,0.8)',
            textAlign: 'center', maxWidth: 400, lineHeight: 1.7,
          }}>
            White-box AI that processes your documents, builds knowledge graphs,
            and creates personalized learning paths — all running 100% locally.
          </p>

          {/* Feature Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-2xl)', justifyContent: 'center' }}>
            {[
              { icon: Brain, label: 'RAG Chat' },
              { icon: Layers, label: 'FSRS Flashcards' },
              { icon: Zap, label: 'Auto Quiz' },
              { icon: Network, label: 'Knowledge Graph' },
            ].map(f => (
              <div key={f.label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                fontSize: '0.8125rem', fontWeight: 500, color: 'white',
              }}>
                <f.icon size={14} />
                {f.label}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 'var(--space-xl)', marginTop: 'var(--space-2xl)' }}>
            {[
              { value: '0', label: 'External APIs' },
              { value: '100%', label: 'White-Box' },
              { value: 'Local', label: 'AI Engine' },
            ].map(s => (
              <div key={s.label} style={{
                textAlign: 'center', padding: '0.75rem 1.25rem',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
              }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>{s.value}</div>
                <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Login Form */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', padding: '2rem',
        position: 'relative', background: 'var(--c-bg-card)',
        transition: 'background var(--duration-slow) ease',
      }}>
        <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 400 }}>
          {/* Brand */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
            marginBottom: 'var(--space-2xl)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              background: 'var(--c-accent-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.25)',
            }}>
              <Sparkles size={20} color="white" strokeWidth={2.5} />
            </div>
            <span style={{
              fontSize: '1.25rem', fontWeight: 700,
              color: 'var(--c-text-primary)', letterSpacing: '-0.02em',
            }}>
              NeuroVault
            </span>
          </div>

          <h2 style={{
            fontSize: '1.75rem', fontWeight: 700, color: 'var(--c-text-primary)',
            letterSpacing: '-0.03em', marginBottom: 8,
          }}>
            Welcome back
          </h2>
          <p style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)', marginBottom: 'var(--space-xl)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--c-accent)', textDecoration: 'none', fontWeight: 600 }}>
              Sign up free
            </Link>
          </p>

          {error && (
            <div className="animate-scale-in" style={{
              padding: '0.875rem', borderRadius: 'var(--radius-md)',
              background: 'var(--c-error-glow)', border: '1px solid rgba(239, 68, 68, 0.15)',
              color: 'var(--c-error)', fontSize: '0.875rem', marginBottom: 'var(--space-lg)',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)', marginBottom: 6, display: 'block' }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)' }} />
                <input className="input" type="email" required value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                  style={{ paddingLeft: '2.5rem' }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)', marginBottom: 6, display: 'block' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)' }} />
                <input className="input" type="password" required value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                  style={{ paddingLeft: '2.5rem' }} />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 'var(--space-sm)', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
              {isLoading ? 'Signing in...' : 'Sign in'}
              {!isLoading && <ArrowRight size={18} />}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', margin: 'var(--space-sm) 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)', fontWeight: 500 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
            </div>

            <a href="http://localhost:5001/api/auth/google" className="btn btn-ghost btn-lg"
              style={{ width: '100%', gap: 'var(--space-md)', textDecoration: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </a>
          </form>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .login-visual-panel { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
