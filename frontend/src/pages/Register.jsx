import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react';
import ThemeToggle from '../components/layout/ThemeToggle';

export default function Register() {
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const parallaxRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!parallaxRef.current) return;
      const orbs = parallaxRef.current.querySelectorAll('.parallax-orb');
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      orbs.forEach((orb, i) => {
        const speed = (i + 1) * 15;
        orb.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    clearError();
    const result = await register(name, email, password);
    if (result.success) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="noise-overlay" style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--c-bg-primary)',
      position: 'relative',
    }}>
      {/* Theme Toggle — góc trên phải */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
        <ThemeToggle />
      </div>
      {/* Left — Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem',
        position: 'relative',
      }}>
        <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 400 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
            marginBottom: 'var(--space-2xl)',
          }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--c-accent-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)',
            }}>
              <Sparkles size={20} color="white" strokeWidth={2.5} />
            </div>
            <span style={{
              fontSize: '1.25rem', fontWeight: 700,
              color: 'var(--c-text-primary)',
              letterSpacing: '-0.02em',
            }}>
              NeuroVault
            </span>
          </div>

          <h2 style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: 'var(--c-text-primary)',
            letterSpacing: '-0.03em',
            marginBottom: 8,
          }}>
            Create your account
          </h2>
          <p style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)', marginBottom: 'var(--space-xl)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{
              color: 'var(--c-accent-light)',
              textDecoration: 'none',
              fontWeight: 500,
            }}>Sign in</Link>
          </p>

          {error && (
            <div className="animate-scale-in" style={{
              padding: '0.875rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--c-error-glow)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--c-error)',
              fontSize: '0.875rem',
              marginBottom: 'var(--space-lg)',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)', marginBottom: 6, display: 'block' }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--c-text-tertiary)',
                }} />
                <input
                  className="input input-with-icon"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)', marginBottom: 6, display: 'block' }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--c-text-tertiary)',
                }} />
                <input
                  className="input input-with-icon"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)', marginBottom: 6, display: 'block' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--c-text-tertiary)',
                }} />
                <input
                  className="input input-with-icon"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg"
              style={{
                width: '100%',
                marginTop: 'var(--space-sm)',
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? 'Creating account...' : 'Create account'}
              {!isLoading && <ArrowRight size={18} />}
            </button>

            {/* Divider */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
              margin: 'var(--space-sm) 0',
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)', fontWeight: 500 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
            </div>

            {/* Google Sign Up */}
            <a
              href="http://localhost:5001/api/auth/google"
              className="btn btn-ghost btn-lg"
              style={{ width: '100%', gap: 'var(--space-md)', textDecoration: 'none' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign up with Google
            </a>

            <p style={{
              fontSize: '0.75rem',
              color: 'var(--c-text-tertiary)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}>
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        </div>
      </div>

      {/* Right — Parallax Visual */}
      <div ref={parallaxRef} style={{
        flex: 1,
        display: 'none',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0a1a 0%, #111128 100%)',
      }}
      className="register-visual-panel"
      >
        <div className="parallax-orb" style={{
          position: 'absolute', top: '15%', right: '15%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
          filter: 'blur(80px)',
          transition: 'transform 0.1s ease-out',
        }} />
        <div className="parallax-orb" style={{
          position: 'absolute', bottom: '20%', left: '10%',
          width: 350, height: 350, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
          filter: 'blur(80px)',
          transition: 'transform 0.15s ease-out',
        }} />
        <div className="parallax-orb" style={{
          position: 'absolute', top: '60%', right: '40%',
          width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
          filter: 'blur(60px)',
          transition: 'transform 0.2s ease-out',
        }} />

        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: '3rem',
          textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64,
            borderRadius: 'var(--radius-xl)',
            background: 'var(--c-accent-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 'var(--space-xl)',
            boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
          }}>
            <Sparkles size={28} color="white" strokeWidth={2} />
          </div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: 'var(--c-text-primary)',
            lineHeight: 1.2,
            letterSpacing: '-0.03em',
            marginBottom: 'var(--space-md)',
          }}>
            100% <span className="text-gradient-animated">White-Box AI</span>
          </h2>
          <p style={{
            fontSize: '1rem',
            color: 'var(--c-text-secondary)',
            maxWidth: 380,
            lineHeight: 1.7,
          }}>
            Every algorithm built from scratch. No external APIs. 
            Complete transparency in how your learning is powered.
          </p>
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .register-visual-panel { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
