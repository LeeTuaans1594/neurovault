import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Network, ChevronLeft, FileText, Sparkles, Loader2 } from 'lucide-react';
import { documentsAPI } from '../services/api';
import KnowledgeGraphView from '../components/knowledge/KnowledgeGraphView';

/**
 * KnowledgeGraphPage — Full-page Knowledge Graph Explorer
 * Route: /knowledge-graph?doc=<documentId>
 */
export default function KnowledgeGraphPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docParam = searchParams.get('doc');

  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      const data = await documentsAPI.list(1, 100);
      const completed = (data.documents || []).filter(
        d => d.metadata?.processing_status === 'completed'
      );
      setDocuments(completed);

      if (docParam) {
        const found = completed.find(d => d._id === docParam);
        if (found) setSelectedDoc(found);
        else if (completed.length > 0) setSelectedDoc(completed[0]);
      } else if (completed.length > 0) {
        setSelectedDoc(completed[0]);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách tài liệu:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in-up" style={{
      height: 'calc(100vh - var(--header-height) - var(--space-xl) * 2)',
      display: 'flex', flexDirection: 'column',
      maxWidth: 1600, margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            <ChevronLeft size={16} /> Quay lại
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 2 }}>
              <Network size={14} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Knowledge Graph Explorer
              </span>
            </div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--c-text-primary)', letterSpacing: '-0.03em' }}>
              Đồ thị kiến thức
            </h1>
          </div>
        </div>

        {/* Document Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <select
            value={selectedDoc?._id || ''}
            onChange={e => {
              const doc = documents.find(d => d._id === e.target.value);
              if (doc) setSelectedDoc(doc);
            }}
            className="input"
            style={{ width: 280, fontSize: '0.8125rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)' }}
          >
            <option value="">-- Chọn tài liệu --</option>
            {documents.map(doc => (
              <option key={doc._id} value={doc._id}>{doc.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Graph Area */}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Loader2 size={28} style={{ color: 'var(--c-accent)', animation: 'rotate-slow 1s linear infinite' }} />
          </div>
        ) : selectedDoc ? (
          <KnowledgeGraphView key={selectedDoc._id} documentId={selectedDoc._id} />
        ) : (
          <div className="empty-state" style={{ height: '100%' }}>
            <div className="empty-state-icon">
              <Network size={32} style={{ color: '#f59e0b' }} strokeWidth={1.5} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 6 }}>
                Chọn tài liệu
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)', maxWidth: 320 }}>
                Chọn một tài liệu để xem đồ thị kiến thức, hoặc upload tài liệu mới.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/documents')}>
              <FileText size={16} /> Quản lý tài liệu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
