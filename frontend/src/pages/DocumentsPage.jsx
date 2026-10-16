import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText, Upload, Search, Filter, Grid, List,
  MoreHorizontal, Trash2, RefreshCw, Clock, CheckCircle,
  AlertCircle, Loader2, Plus, BookOpen, ChevronDown,
} from 'lucide-react';
import { documentsAPI } from '../services/api';
import useI18nStore from '../store/useI18nStore';

export default function DocumentsPage() {
  const navigate = useNavigate();
  const t = useI18nStore(s => s.t);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });

  useEffect(() => { loadDocuments(); }, [pagination.page]);

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      const data = await documentsAPI.list(pagination.page, 20);
      setDocuments(data.documents || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this document?')) return;
    try {
      await documentsAPI.delete(id);
      loadDocuments();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = !searchQuery || 
      doc.title?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || 
      doc.metadata?.processing_status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusConfig = (status) => {
    const configs = {
      completed: { label: t('documents.completed'), icon: CheckCircle, color: 'var(--c-success)', bg: 'var(--c-success-glow)' },
      processing: { label: t('documents.processing'), icon: Loader2, color: '#b45309', bg: 'var(--c-warning-glow)' },
      pending: { label: t('documents.pending'), icon: Clock, color: 'var(--c-text-tertiary)', bg: 'var(--c-bg-secondary)' },
      failed: { label: t('documents.failed'), icon: AlertCircle, color: 'var(--c-error)', bg: 'var(--c-error-glow)' },
    };
    return configs[status] || configs.pending;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--c-text-primary)', letterSpacing: '-0.03em' }}>
            {t('documents.title')}
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)', marginTop: 4 }}>
            {t('documents.subtitle')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <Plus size={16} />
          {t('documents.upload')}
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)' }} />
          <input
            className="input"
            placeholder={t('documents.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '2.25rem', height: 38, fontSize: '0.8125rem' }}
          />
        </div>

        {/* Filter */}
        <div style={{ position: 'relative' }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              appearance: 'none',
              background: 'var(--c-bg-card)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 2rem 0.5rem 0.75rem',
              fontSize: '0.8125rem',
              color: 'var(--c-text-primary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              height: 38,
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <option value="all">All Status</option>
            <option value="completed">Ready</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--c-text-tertiary)' }} />
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {[{ mode: 'grid', icon: Grid }, { mode: 'list', icon: List }].map(v => (
            <button key={v.mode} onClick={() => setViewMode(v.mode)} style={{
              padding: '0.5rem 0.75rem', border: 'none', cursor: 'pointer',
              background: viewMode === v.mode ? 'var(--c-accent-glow)' : 'var(--c-bg-card)',
              color: viewMode === v.mode ? 'var(--c-accent)' : 'var(--c-text-tertiary)',
              transition: 'all var(--duration-fast)',
            }}>
              <v.icon size={16} />
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button className="btn btn-ghost btn-icon" onClick={loadDocuments} title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ display: viewMode === 'grid' ? 'grid' : 'flex', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)', flexDirection: 'column' }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton" style={{ height: viewMode === 'grid' ? 180 : 72, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bento-card empty-state" style={{ padding: 'var(--space-3xl)' }}>
          <div className="empty-state-icon">
            <BookOpen size={32} style={{ color: 'var(--c-accent)' }} strokeWidth={1.5} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 8 }}>
              {searchQuery || filterStatus !== 'all' ? 'No documents found' : 'Start your learning journey'}
            </h3>
            <p style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filter criteria.'
                : 'Upload a document and our AI will analyze it, extract key concepts, and create a personalized learning path.'}
            </p>
          </div>
          {!searchQuery && filterStatus === 'all' && (
            <button className="btn btn-primary btn-lg" onClick={() => setShowUpload(true)}>
              <Upload size={18} />
              Upload Your First Document
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {filteredDocs.map((doc, i) => {
            const status = getStatusConfig(doc.metadata?.processing_status);
            return (
              <Link key={doc._id} to={`/documents/${doc._id}`}
                className={`bento-card animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
                style={{ textDecoration: 'none', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--c-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={20} style={{ color: 'var(--c-accent)' }} strokeWidth={1.5} />
                  </div>
                  <button onClick={(e) => handleDelete(doc._id, e)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--radius-sm)', color: 'var(--c-text-tertiary)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-error)'; e.currentTarget.style.background = 'var(--c-error-glow)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)' }}>
                    {formatDate(doc.createdAt)} {doc.file_size ? `· ${formatSize(doc.file_size)}` : ''} {doc.metadata?.word_count > 0 ? `· ${doc.metadata.word_count.toLocaleString()} words` : ''}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.6875rem', fontWeight: 500, color: status.color, background: status.bg, padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-full)', alignSelf: 'flex-start' }}>
                  <status.icon size={12} strokeWidth={2} style={doc.metadata?.processing_status === 'processing' ? { animation: 'rotate-slow 1s linear infinite' } : {}} />
                  {status.label}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {filteredDocs.map((doc, i) => {
            const status = getStatusConfig(doc.metadata?.processing_status);
            return (
              <Link key={doc._id} to={`/documents/${doc._id}`}
                className={`bento-card animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
                style={{ textDecoration: 'none', padding: 'var(--space-md) var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--c-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={18} style={{ color: 'var(--c-accent)' }} strokeWidth={1.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--c-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)', marginTop: 2 }}>
                    {formatDate(doc.createdAt)} {doc.metadata?.word_count > 0 ? `· ${doc.metadata.word_count.toLocaleString()} words` : ''}
                  </div>
                </div>
                <span className="badge" style={{ background: status.bg, color: status.color }}>
                  <status.icon size={12} />{status.label}
                </span>
                <button onClick={(e) => handleDelete(doc._id, e)} className="btn btn-ghost btn-icon" style={{ flexShrink: 0, width: 32, height: 32 }}>
                  <Trash2 size={14} />
                </button>
              </Link>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); loadDocuments(); }} />}
    </div>
  );
}

/* ═══ UPLOAD MODAL ═══ */
function UploadModal({ onClose, onSuccess }) {
  const t = useI18nStore(s => s.t);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) { setFile(droppedFile); if (!title) setTitle(droppedFile.name.replace(/\.[^/.]+$/, '')); }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) { setFile(selectedFile); if (!title) setTitle(selectedFile.name.replace(/\.[^/.]+$/, '')); }
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      setIsUploading(true); setError(''); setUploadProgress(0);
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      await documentsAPI.upload(file, title);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setTimeout(() => onSuccess(), 500);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="animate-scale-in" style={{ width: '100%', maxWidth: 520, borderRadius: 'var(--radius-xl)', padding: 'var(--space-xl)', background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', boxShadow: 'var(--shadow-xl)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 'var(--space-lg)', letterSpacing: '-0.02em' }}>{t('dashboard.uploadTitle')}</h2>
        <div style={{ border: `2px dashed ${dragOver ? 'var(--c-accent)' : 'var(--c-border)'}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-2xl)', textAlign: 'center', transition: 'all var(--duration-normal)', background: dragOver ? 'var(--c-accent-glow)' : 'var(--c-bg-secondary)', cursor: 'pointer', marginBottom: 'var(--space-lg)' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
          onClick={() => document.getElementById('file-input').click()}>
          <input id="file-input" type="file" accept=".pdf,.txt,.md,.docx" onChange={handleFileSelect} style={{ display: 'none' }} />
          <Upload size={28} style={{ color: 'var(--c-text-tertiary)', marginBottom: 12 }} strokeWidth={1.5} />
          {file ? (
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>{file.name}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-tertiary)', marginTop: 4 }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)' }}>{t('dashboard.dropFile')}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-tertiary)', marginTop: 4 }}>{t('dashboard.fileFormats')}</div>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)', marginBottom: 6, display: 'block' }}>{t('dashboard.titleOptional')}</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('dashboard.titlePlaceholder')} />
        </div>
        {isUploading && (
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} /></div>
            <div style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)', textAlign: 'center', marginTop: 6 }}>{uploadProgress < 100 ? t('dashboard.uploading') : t('dashboard.complete')}</div>
          </div>
        )}
        {error && <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--c-error-glow)', color: 'var(--c-error)', fontSize: '0.8125rem', marginBottom: 'var(--space-md)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={!file || isUploading} style={{ opacity: (!file || isUploading) ? 0.5 : 1 }}>
            {isUploading ? t('dashboard.uploading') : t('dashboard.uploadBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
