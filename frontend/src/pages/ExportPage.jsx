import { useState, useEffect, useRef } from 'react';
import { Download, Upload, FileSpreadsheet, FileText, Database, BookOpen, Loader2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { exportAPI } from '../services/api';
import useI18nStore from '../store/useI18nStore';

const EXPORT_ITEMS = [
  { id: 'flashcards-csv', label: 'Flashcards (CSV)', desc: 'Front, back, FSRS data', icon: '🃏', category: 'export', action: () => exportAPI.downloadFlashcards('csv') },
  { id: 'flashcards-anki', label: 'Flashcards (Anki)', desc: 'Import-ready for Anki app', icon: '📦', category: 'export', action: () => exportAPI.downloadFlashcards('anki') },
  { id: 'concepts-csv', label: 'Concept Mastery (CSV)', desc: 'Concepts, definitions, mastery %', icon: '🧠', category: 'export', action: () => exportAPI.downloadConcepts() },
  { id: 'sessions-csv', label: 'Study Sessions (CSV)', desc: 'Dates, durations, quiz scores', icon: '📊', category: 'export', action: () => exportAPI.downloadSessions() },
  { id: 'backup-json', label: 'Full Backup (JSON)', desc: 'All data — documents, progress, XP', icon: '💾', category: 'export', action: () => exportAPI.downloadBackup() },
];

export default function ExportPage() {
  const t = useI18nStore(s => s.t);
  const [stats, setStats] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    exportAPI.stats().then(setStats).catch(() => {});
  }, []);

  const handleExport = async (item) => {
    setActiveId(item.id);
    setError(null);
    try {
      await item.action();
    } catch (err) {
      setError(err.message);
    }
    setTimeout(() => setActiveId(null), 1500);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    setError(null);

    try {
      const text = await file.text();
      let cards = [];

      if (file.name.endsWith('.csv')) {
        const lines = text.split('\n').filter(l => l.trim());
        // Skip header
        for (let i = 1; i < lines.length; i++) {
          const parts = parseCSVLine(lines[i]);
          if (parts.length >= 2) cards.push({ front: parts[0], back: parts[1] });
        }
      } else {
        // TSV / Anki format
        const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        for (const line of lines) {
          const [front, back] = line.split('\t');
          if (front && back) cards.push({ front: front.trim(), back: back.trim() });
        }
      }

      if (cards.length === 0) {
        setError('No valid flashcards found in file');
        setIsImporting(false);
        return;
      }

      const result = await exportAPI.importFlashcards(cards);
      setImportResult(result);
    } catch (err) {
      setError(err.message);
    }
    setIsImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--c-text-primary)', marginBottom: 4 }}>
          <span className="text-gradient">{t('export.title')}</span>
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)' }}>
          {t('export.subtitle')}
        </p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
          {[
            { label: 'Flashcards', value: stats.flashcards, icon: '🃏' },
            { label: 'Concepts', value: stats.concepts, icon: '🧠' },
            { label: 'Sessions', value: stats.sessions, icon: '📊' },
          ].map(s => (
            <div key={s.label} className="bento-card" style={{ flex: 1, padding: 'var(--space-md)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{s.value}</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Export Section */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)' }}>
          <Download size={16} style={{ color: 'var(--c-accent)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{t('export.exportData')}</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--space-md)' }}>
          {EXPORT_ITEMS.map(item => {
            const isActive = activeId === item.id;
            return (
              <button key={item.id} onClick={() => handleExport(item)} disabled={isActive}
                className="bento-card" style={{
                  padding: 'var(--space-lg)', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 8, width: '100%', border: '1px solid var(--c-border)',
                  transition: 'all 0.2s', opacity: isActive ? 0.7 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.transform = 'none'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                  {isActive ? <CheckCircle size={16} style={{ color: 'var(--c-success)' }} /> : <Download size={14} style={{ color: 'var(--c-text-muted)' }} />}
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', marginTop: 2 }}>{item.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Import Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)' }}>
          <Upload size={16} style={{ color: 'var(--c-accent)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{t('export.importCards')}</h2>
        </div>

        <div className="bento-card" style={{ padding: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--c-text-secondary)', marginBottom: 8 }}>
                Import flashcards from a CSV or Anki export file. Format: <code style={{ fontSize: '0.6875rem', padding: '2px 6px', background: 'var(--c-bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>front,back</code> (CSV) or <code style={{ fontSize: '0.6875rem', padding: '2px 6px', background: 'var(--c-bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>front{'<tab>'}back</code> (TSV).
              </p>
              <p style={{ fontSize: '0.6875rem', color: 'var(--c-text-muted)' }}>
                {t('export.dupSkipped')}
              </p>
            </div>

            <label className="btn btn-secondary" style={{ cursor: 'pointer', gap: 6 }}>
              {isImporting ? <Loader2 size={14} style={{ animation: 'rotate-slow 1s linear infinite' }} /> : <Upload size={14} />}
              {isImporting ? t('export.importing') : t('export.chooseFile')}
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleImportFile}
                style={{ display: 'none' }} disabled={isImporting} />
            </label>
          </div>

          {/* Import Result */}
          {importResult && (
            <div style={{ marginTop: 'var(--space-md)', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--c-success-glow)', border: '1px solid rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} style={{ color: 'var(--c-success)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--c-text-primary)' }}>
                {importResult.message}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 'var(--space-md)', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-error-glow)', border: '1px solid rgba(248,113,113,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} style={{ color: 'var(--c-error)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--c-error)' }}>{error}</span>
        </div>
      )}
    </div>
  );
}

/** Parse a CSV line handling quoted fields */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}
