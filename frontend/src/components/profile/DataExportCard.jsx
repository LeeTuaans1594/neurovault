/**
 * DataExportCard — Export toàn bộ dữ liệu học tập dạng JSON
 * Có nút download + preview tóm tắt
 */
import { useState } from 'react';
import { Download, FileJson, Loader, CheckCircle } from 'lucide-react';
import { learningAPI } from '../../services/api';

export default function DataExportCard() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setExportDone(false);

    try {
      await learningAPI.exportData();
      setExportDone(true);
      setTimeout(() => setExportDone(false), 4000);
    } catch (err) {
      setError(err.message || 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bento-card" style={{ padding: 'var(--space-xl)' }}>
      <h3 style={{
        fontSize: '1rem', fontWeight: 600,
        color: 'var(--c-text-primary)',
        marginBottom: 'var(--space-sm)',
      }}>
        Data Export
      </h3>
      <p style={{
        fontSize: '0.8125rem',
        color: 'var(--c-text-tertiary)',
        marginBottom: 'var(--space-lg)',
        lineHeight: 1.5,
      }}>
        Download all your learning data including study sessions, flashcard states, concept mastery, and quiz history.
      </p>

      {/* Export info */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)',
        marginBottom: 'var(--space-lg)',
      }}>
        {[
          { label: 'Format', value: 'JSON' },
          { label: 'Includes', value: 'Profile, Progress, Sessions, Documents' },
          { label: 'Privacy', value: 'Passwords are excluded' },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '0.8125rem',
          }}>
            <span style={{ color: 'var(--c-text-tertiary)' }}>{item.label}</span>
            <span style={{ color: 'var(--c-text-secondary)', fontWeight: 500 }}>{item.value}</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '0.5rem 0.75rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--c-error-glow)',
          color: 'var(--c-error)',
          fontSize: '0.8125rem',
          marginBottom: 'var(--space-md)',
        }}>
          {error}
        </div>
      )}

      <button
        id="btn-export-data"
        onClick={handleExport}
        disabled={isExporting}
        className="btn btn-secondary"
        style={{
          width: '100%',
          justifyContent: 'center',
          gap: 8,
          opacity: isExporting ? 0.6 : 1,
        }}
      >
        {isExporting ? (
          <>
            <Loader size={16} style={{ animation: 'rotate-slow 1s linear infinite' }} />
            Exporting...
          </>
        ) : exportDone ? (
          <>
            <CheckCircle size={16} color="var(--c-success)" />
            <span style={{ color: 'var(--c-success)' }}>Downloaded!</span>
          </>
        ) : (
          <>
            <Download size={16} />
            Export All Data (.json)
          </>
        )}
      </button>
    </div>
  );
}
