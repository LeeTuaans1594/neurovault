/**
 * NeuroVault — Error Boundary Component
 *
 * React class component bắt runtime errors và hiển thị UI fallback.
 * Hỗ trợ: retry, error details, onError callback.
 * Production-safe: không lộ stack trace cho end user.
 */
import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Callback nếu parent muốn log/report
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log chi tiết ra console cho developer
    console.error('[NeuroVault ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback từ props
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          retry: this.handleRetry,
        });
      }

      // Inline fallback — minimal variant (for nested boundaries)
      if (this.props.minimal) {
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
            padding: 'var(--space-lg)',
            background: 'var(--c-error-glow)',
            border: '1px solid rgba(248, 113, 113, 0.15)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <AlertTriangle size={18} style={{ color: 'var(--c-error)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
                Đã xảy ra lỗi
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)', marginTop: 2 }}>
                {this.state.error?.message || 'Component rendering failed'}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={this.handleRetry}
              style={{ flexShrink: 0 }}
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        );
      }

      // Full-page fallback
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: 'var(--space-2xl)',
        }}>
          <div style={{
            maxWidth: 480,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-xl)',
          }}>
            {/* Error Icon */}
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 'var(--radius-xl)',
              background: 'var(--c-error-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'scaleIn 0.5s var(--ease-spring) forwards',
            }}>
              <AlertTriangle size={36} style={{ color: 'var(--c-error)' }} strokeWidth={1.5} />
            </div>

            {/* Error Text */}
            <div>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--c-text-primary)',
                marginBottom: 8,
                letterSpacing: '-0.02em',
              }}>
                Oops! Đã xảy ra lỗi
              </h2>
              <p style={{
                fontSize: '0.9375rem',
                color: 'var(--c-text-secondary)',
                lineHeight: 1.6,
                maxWidth: 360,
                margin: '0 auto',
              }}>
                Một thành phần của NeuroVault đã gặp sự cố. Bạn có thể thử tải lại hoặc quay về trang chủ.
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <button className="btn btn-primary" onClick={this.handleRetry}>
                <RefreshCw size={16} /> Thử lại
              </button>
              <button className="btn btn-ghost" onClick={this.handleGoHome}>
                <Home size={16} /> Trang chủ
              </button>
            </div>

            {/* Developer details toggle */}
            <button
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--c-text-tertiary)',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Bug size={12} />
              {this.state.showDetails ? 'Ẩn chi tiết' : 'Xem chi tiết lỗi'}
            </button>

            {this.state.showDetails && (
              <div style={{
                width: '100%',
                textAlign: 'left',
                padding: 'var(--space-md)',
                background: 'var(--c-bg-secondary)',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                color: 'var(--c-error)',
                maxHeight: 200,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>
                <strong>{this.state.error?.toString()}</strong>
                {this.state.errorInfo?.componentStack && (
                  <div style={{ marginTop: 8, color: 'var(--c-text-tertiary)' }}>
                    {this.state.errorInfo.componentStack}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
