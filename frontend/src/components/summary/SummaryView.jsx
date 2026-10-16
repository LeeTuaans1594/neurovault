import { useState } from 'react';
import { FileText, Loader2, RotateCcw, Sparkles, Copy, Check, BookMarked } from 'lucide-react';
import { aiAPI } from '../../services/api';
import MarkdownRenderer from '../shared/MarkdownRenderer';

/**
 * SummaryView — AI Document Summarization
 * 
 * Hỗ trợ 2 loại summary:
 * - Extractive (TextRank + MMR) — trích xuất câu quan trọng
 * - Abstractive (Gemma 4) — viết lại tóm tắt tự nhiên
 * 
 * Hiển thị keywords, cho phép copy kết quả.
 */

const SUMMARY_TYPES = [
  { id: 'extractive', label: 'Trích xuất', desc: 'TextRank — câu quan trọng nhất' },
  { id: 'abstractive', label: 'Tổng hợp', desc: 'Gemma 4 — viết lại tự nhiên' },
];

const SENTENCE_OPTIONS = [3, 5, 8, 10, 15];

export default function SummaryView({ documentId }) {
  const [summaryType, setSummaryType] = useState('extractive');
  const [maxSentences, setMaxSentences] = useState(5);
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateSummary = async () => {
    try {
      setIsLoading(true);
      setError('');
      setStarted(true);

      const data = await aiAPI.generateSummary(documentId, maxSentences, summaryType);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Không thể tạo tóm tắt. Đảm bảo AI server đang chạy.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.summary) return;
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  const handleReset = () => {
    setStarted(false);
    setResult(null);
    setError('');
  };

  // ── Start Screen ──
  if (!started) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-xl)',
        padding: 'var(--space-xl)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 'var(--radius-xl)',
          background: 'rgba(59, 130, 246, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BookMarked size={32} style={{ color: '#3b82f6' }} strokeWidth={1.5} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 8 }}>
            AI Summary
          </h3>
          <p style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)', maxWidth: 400 }}>
            Tạo bản tóm tắt thông minh từ tài liệu. Chọn kiểu tóm tắt và độ dài mong muốn.
          </p>
        </div>

        {/* Summary Type */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', width: '100%', maxWidth: 400 }}>
          {SUMMARY_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => setSummaryType(type.id)}
              style={{
                flex: 1, padding: 'var(--space-md)',
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${summaryType === type.id ? 'rgba(99,102,241,0.3)' : 'var(--c-border)'}`,
                background: summaryType === type.id ? 'var(--c-accent-glow)' : 'var(--c-bg-card)',
                cursor: 'pointer', textAlign: 'center',
                transition: 'all var(--duration-fast)',
              }}
            >
              <div style={{
                fontSize: '0.875rem', fontWeight: 600,
                color: summaryType === type.id ? 'var(--c-accent)' : 'var(--c-text-primary)',
              }}>
                {type.label}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', marginTop: 2 }}>
                {type.desc}
              </div>
            </button>
          ))}
        </div>

        {/* Sentence Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <label style={{ fontSize: '0.8125rem', color: 'var(--c-text-secondary)' }}>Số câu:</label>
          <select
            value={maxSentences}
            onChange={e => setMaxSentences(Number(e.target.value))}
            style={{
              padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--c-border)', fontSize: '0.875rem',
              background: 'var(--c-bg-card)', fontFamily: 'var(--font-sans)',
              color: 'var(--c-text-primary)',
            }}
          >
            {SENTENCE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button className="btn btn-primary btn-lg" onClick={generateSummary}>
          <Sparkles size={18} /> Tạo tóm tắt
        </button>
      </div>
    );
  }

  // ── Loading ──
  if (isLoading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-lg)',
      }}>
        <Loader2 size={32} style={{ color: 'var(--c-accent)', animation: 'rotate-slow 1s linear infinite' }} />
        <div style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)' }}>
          Đang tạo tóm tắt{summaryType === 'abstractive' ? ' (Gemma 4)' : ' (TextRank)'}...
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-lg)',
      }}>
        <div style={{ color: 'var(--c-error)', fontSize: '0.9375rem', textAlign: 'center', maxWidth: 400 }}>
          {error}
        </div>
        <button className="btn btn-ghost" onClick={handleReset}>
          <RotateCcw size={16} /> Thử lại
        </button>
      </div>
    );
  }

  // ── Result ──
  return (
    <div style={{ padding: 'var(--space-xl)', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--space-lg)',
      }}>
        <div>
          <div style={{
            fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
          }}>
            {summaryType === 'extractive' ? '📊 Trích xuất (TextRank)' : '🤖 Tổng hợp (Gemma 4)'}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
            Tóm tắt tài liệu
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            onClick={handleCopy}
            className="btn btn-ghost btn-sm"
            style={{ gap: 4 }}
          >
            {copied ? <Check size={14} color="var(--c-success)" /> : <Copy size={14} />}
            {copied ? 'Đã copy' : 'Copy'}
          </button>
          <button onClick={handleReset} className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
            <RotateCcw size={14} /> Tạo lại
          </button>
        </div>
      </div>

      {/* Summary text */}
      <div style={{
        padding: 'var(--space-lg)',
        background: 'var(--c-bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--c-border)',
        fontSize: '0.9375rem',
        lineHeight: 1.8,
        color: 'var(--c-text-primary)',
        marginBottom: 'var(--space-xl)',
      }}>
        <MarkdownRenderer content={result?.summary || 'Không có kết quả.'} />
      </div>

      {/* Keywords */}
      {result?.keywords && result.keywords.length > 0 && (
        <div>
          <div style={{
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-text-tertiary)',
            textTransform: 'uppercase', marginBottom: 'var(--space-sm)',
          }}>
            Từ khóa chính
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
            {result.keywords.map((kw, i) => (
              <span key={i} className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
                {typeof kw === 'string' ? kw : kw.keyword || kw.word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {result?.stats && (
        <div style={{
          marginTop: 'var(--space-lg)',
          padding: 'var(--space-md)',
          background: 'var(--c-bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          display: 'flex', gap: 'var(--space-xl)',
        }}>
          {Object.entries(result.stats).map(([key, value]) => (
            <div key={key} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>
                {typeof value === 'number' ? value.toLocaleString() : value}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', textTransform: 'capitalize' }}>
                {key.replace(/_/g, ' ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
