import { useState, useEffect } from 'react';
import { FileText, Loader2, AlertCircle, Download, ExternalLink } from 'lucide-react';
import { documentsAPI } from '../../services/api';

/**
 * PDFViewer — Hiển thị file PDF inline qua blob URL + object/embed tag.
 * Tải file qua authenticated API endpoint, tạo blob URL để render.
 * Tự động cleanup blob URL khi unmount.
 * Props: documentId, fileName
 */
export default function PDFViewer({ documentId, fileName = 'document.pdf' }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let currentBlobUrl = null;

    const loadFile = async () => {
      try {
        setIsLoading(true);
        setError('');
        const result = await documentsAPI.getFileBlob(documentId);
        if (!cancelled) {
          currentBlobUrl = result.blobUrl;
          setBlobUrl(result.blobUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Không thể tải file PDF');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadFile();

    // Cleanup blob URL khi unmount
    return () => {
      cancelled = true;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [documentId]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 'var(--space-md)',
      }}>
        <Loader2
          size={28}
          style={{ color: 'var(--c-accent)', animation: 'rotate-slow 1s linear infinite' }}
        />
        <span style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)' }}>
          Đang tải PDF...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 'var(--space-lg)',
        padding: 'var(--space-2xl)',
      }}>
        <AlertCircle size={32} style={{ color: 'var(--c-error)' }} strokeWidth={1.5} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 4 }}>
            Không thể hiển thị PDF
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-tertiary)' }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* PDF Toolbar */}
      <div style={{
        padding: 'var(--space-sm) var(--space-md)',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
        background: 'var(--c-bg-secondary)',
      }}>
        <FileText size={14} style={{ color: 'var(--c-accent)' }} />
        <span style={{
          fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {fileName}
        </span>
        <a
          href={blobUrl}
          download={fileName}
          className="btn btn-ghost btn-sm"
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem', textDecoration: 'none' }}
          title="Tải về"
        >
          <Download size={12} /> Tải về
        </a>
        <a
          href={blobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem', textDecoration: 'none' }}
          title="Mở tab mới"
        >
          <ExternalLink size={12} />
        </a>
      </div>

      {/* PDF Embed */}
      <div style={{ flex: 1, overflow: 'hidden', background: '#525659' }}>
        <object
          data={blobUrl}
          type="application/pdf"
          style={{ width: '100%', height: '100%', border: 'none' }}
        >
          {/* Fallback: iframe */}
          <iframe
            src={blobUrl}
            title={fileName}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </object>
      </div>
    </div>
  );
}
