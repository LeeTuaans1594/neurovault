import { useState, useRef } from 'react';
import { ScanLine, Upload, FileText, Loader2, CheckCircle, AlertCircle, Copy, Check, ArrowRight } from 'lucide-react';
import { ocrAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import useI18nStore from '../store/useI18nStore';

const ACCEPTED = '.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp';

export default function OCRPage() {
  const navigate = useNavigate();
  const t = useI18nStore(s => s.t);
  const fileRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('extract'); // extract | document
  const [docTitle, setDocTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const [createdDoc, setCreatedDoc] = useState(null);

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setCreatedDoc(null);

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) {
      setFile(f);
      setResult(null);
      setError(null);
      setCreatedDoc(null);
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      if (mode === 'extract') {
        const data = await ocrAPI.extract(file);
        setResult(data);
      } else {
        const data = await ocrAPI.uploadAsDocument(file, docTitle || undefined);
        setResult(data.ocr);
        setCreatedDoc(data.document);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (result?.text) {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getConfidenceColor = (c) => {
    if (c >= 80) return 'var(--c-success)';
    if (c >= 50) return '#fbbf24';
    return 'var(--c-error)';
  };

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--c-text-primary)', marginBottom: 4 }}>
          <span className="text-gradient">{t('ocr.title')}</span>
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)' }}>
          {t('ocr.subtitle')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        {/* Left: Upload + Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {/* Drop Zone */}
          <div
            className="bento-card"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            style={{
              padding: preview ? 'var(--space-sm)' : 'var(--space-2xl)',
              textAlign: 'center', cursor: 'pointer',
              borderStyle: file ? 'solid' : 'dashed',
              borderColor: file ? 'rgba(99,102,241,0.3)' : 'var(--c-border)',
              minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={{
                maxWidth: '100%', maxHeight: 300, borderRadius: 'var(--radius-md)',
                objectFit: 'contain',
              }} />
            ) : (
              <div>
                <Upload size={32} style={{ color: 'var(--c-text-muted)', marginBottom: 'var(--space-sm)' }} />
                <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)', fontWeight: 500 }}>
                  {t('ocr.dropzone')}
                </p>
                <p style={{ fontSize: '0.6875rem', color: 'var(--c-text-muted)', marginTop: 4 }}>
                  {t('ocr.formats')}
                </p>
              </div>
            )}
            <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileSelect} style={{ display: 'none' }} />
          </div>

          {/* File Info */}
          {file && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--c-text-secondary)' }}>
              <FileText size={14} />
              <span style={{ fontWeight: 500 }}>{file.name}</span>
              <span style={{ color: 'var(--c-text-muted)' }}>({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}

          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 3, background: 'var(--c-bg-secondary)', borderRadius: 'var(--radius-md)', padding: 3 }}>
            {[{ value: 'extract', label: `📝 ${t('ocr.extractText')}` }, { value: 'document', label: `📄 ${t('ocr.createDoc')}` }].map(m => (
              <button key={m.value} onClick={() => setMode(m.value)} style={{
                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 600,
                background: mode === m.value ? 'var(--c-accent-gradient)' : 'transparent',
                color: mode === m.value ? '#fff' : 'var(--c-text-tertiary)',
              }}>{m.label}</button>
            ))}
          </div>

          {/* Document title (only in document mode) */}
          {mode === 'document' && (
            <input
              type="text" value={docTitle} onChange={e => setDocTitle(e.target.value)}
              placeholder="Document title (optional)"
              className="input" style={{ fontSize: '0.8125rem' }}
            />
          )}

          {/* Process Button */}
          <button
            onClick={handleProcess}
            disabled={!file || isProcessing}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center', gap: 8 }}
          >
            {isProcessing ? (
              <><Loader2 size={16} className="animate-spin" style={{ animation: 'rotate-slow 1s linear infinite' }} /> {t('ocr.processing')}</>
            ) : (
              <><ScanLine size={16} /> {mode === 'extract' ? t('ocr.extractText') : `OCR & ${t('ocr.createDoc')}`}</>
            )}
          </button>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-error-glow)', border: '1px solid rgba(248,113,113,0.15)' }}>
              <AlertCircle size={14} style={{ color: 'var(--c-error)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--c-error)' }}>{error}</span>
            </div>
          )}
        </div>

        {/* Right: Result */}
        <div className="bento-card" style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', minHeight: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>
              {t('ocr.extracted')}
            </span>
            {result && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Confidence badge */}
                <span style={{
                  fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  color: getConfidenceColor(result.confidence),
                  background: `${getConfidenceColor(result.confidence)}15`,
                }}>
                  {result.confidence}% {t('ocr.confidence')}
                </span>
                {/* Word count */}
                <span style={{ fontSize: '0.625rem', color: 'var(--c-text-muted)' }}>
                  {result.wordCount} {t('ocr.words')}
                </span>
                {/* Copy */}
                <button onClick={handleCopy} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: copied ? 'var(--c-success)' : 'var(--c-text-tertiary)',
                }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            )}
          </div>

          {result ? (
            <div style={{
              flex: 1, overflowY: 'auto', padding: 'var(--space-md)',
              background: 'var(--c-bg-secondary)', borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1.6,
              color: 'var(--c-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {result.text || result.preview || 'No text extracted.'}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <ScanLine size={32} style={{ color: 'var(--c-text-muted)' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--c-text-tertiary)' }}>
                {t('ocr.noText')}
              </p>
            </div>
          )}

          {/* Created document link */}
          {createdDoc && (
            <button onClick={() => navigate(`/documents/${createdDoc._id}`)} className="btn btn-ghost" style={{
              marginTop: 'var(--space-md)', justifyContent: 'center', gap: 6, width: '100%',
            }}>
              <CheckCircle size={14} style={{ color: 'var(--c-success)' }} />
              {t('ocr.docCreated')} <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
