import { useState, useEffect } from 'react';
import { Search, BookOpen, Heart, Star, Eye, Download, Filter, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import { libraryAPI } from '../services/api';
import useI18nStore from '../store/useI18nStore';

const SUBJECTS = [
  { value: '', labelKey: 'library.all', icon: '📚' },
  { value: 'cs', label: 'CS', icon: '💻' },
  { value: 'math', label: 'Math', icon: '📐' },
  { value: 'science', label: 'Science', icon: '🔬' },
  { value: 'language', label: 'Language', icon: '🌐' },
  { value: 'history', label: 'History', icon: '📜' },
  { value: 'business', label: 'Business', icon: '💼' },
  { value: 'art', label: 'Art', icon: '🎨' },
  { value: 'other', label: 'Other', icon: '📁' },
];

export default function LibraryPage() {
  const t = useI18nStore(s => s.t);
  const [items, setItems] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [sort, setSort] = useState('recent');
  const [isLoading, setIsLoading] = useState(true);

  const SORTS = [
    { value: 'recent', label: t('library.recent') },
    { value: 'popular', label: t('library.popular') },
    { value: 'rating', label: t('library.topRated') },
  ];

  useEffect(() => { loadData(); }, [page, subject, sort]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await libraryAPI.browse({ page, limit: 12, subject, sort, search: search || undefined });
      setItems(data?.items || []);
      setTotal(data?.total || 0);
      setTotalPages(data?.totalPages || 1);
      if (data?.featured) setFeatured(data.featured);
    } catch { /* */ }
    setIsLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleLike = async (id) => {
    const result = await libraryAPI.like(id);
    if (result) {
      setItems(prev => prev.map(it => it._id === id ? { ...it, isLiked: result.liked, likes: result.likes } : it));
    }
  };

  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} size={10} fill={i < Math.round(rating) ? '#fbbf24' : 'none'}
        style={{ color: i < Math.round(rating) ? '#fbbf24' : 'var(--c-text-muted)' }} />
    ));
  };

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--c-text-primary)', marginBottom: 4 }}>
          <span className="text-gradient">{t('library.title')}</span>
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)' }}>
          {t('library.subtitle')}
        </p>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('library.search')}
            className="input" style={{ paddingLeft: 34, width: '100%' }} />
        </form>
        <div style={{ display: 'flex', gap: 3, background: 'var(--c-bg-secondary)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          {SORTS.map(s => (
            <button key={s.value} onClick={() => { setSort(s.value); setPage(1); }} style={{
              padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              fontSize: '0.6875rem', fontWeight: 600,
              background: sort === s.value ? 'var(--c-accent-gradient)' : 'transparent',
              color: sort === s.value ? '#fff' : 'var(--c-text-tertiary)',
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Subject Pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-lg)', overflowX: 'auto', paddingBottom: 4 }}>
        {SUBJECTS.map(s => (
          <button key={s.value} onClick={() => { setSubject(s.value); setPage(1); }} style={{
            padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid',
            cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s',
            background: subject === s.value ? 'var(--c-accent-glow)' : 'transparent',
            borderColor: subject === s.value ? 'rgba(99,102,241,0.3)' : 'var(--c-border)',
            color: subject === s.value ? 'var(--c-accent)' : 'var(--c-text-tertiary)',
          }}>
            <span>{s.icon}</span> {s.labelKey ? t(s.labelKey) : s.label}
          </button>
        ))}
      </div>

      {/* Content Grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 220, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bento-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <BookOpen size={32} style={{ color: 'var(--c-text-muted)', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--c-text-tertiary)', fontSize: '0.875rem' }}>{t('library.noContent')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {items.map(item => (
            <div key={item._id} className="bento-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10, transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = ''; }}>
              {/* Subject badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--c-accent)', background: 'var(--c-accent-glow)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                  {SUBJECTS.find(s => s.value === item.subject)?.icon} {item.subject || 'other'}
                </span>
                <span style={{ fontSize: '0.5625rem', color: 'var(--c-text-muted)' }}>{item.language?.toUpperCase()}</span>
              </div>

              {/* Title */}
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--c-text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {item.title}
              </h3>

              {/* Preview */}
              {item.content_preview && (
                <p style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {item.content_preview}
                </p>
              )}

              {/* Tags */}
              {item.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {item.tags.slice(0, 3).map(tag => (
                    <span key={tag} style={{ fontSize: '0.5625rem', padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-tertiary)', color: 'var(--c-text-tertiary)' }}>#{tag}</span>
                  ))}
                </div>
              )}

              {/* Author + Stats */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--c-accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: '#fff' }}>
                    {(item.author?.name || 'A').charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-secondary)' }}>{item.author?.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.625rem', color: 'var(--c-text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{renderStars(item.average_rating || 0)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Eye size={10} />{item.views || 0}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleLike(item._id); }} style={{
                    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
                    color: item.isLiked ? '#ef4444' : 'var(--c-text-muted)', fontSize: '0.625rem', padding: 0,
                  }}>
                    <Heart size={10} fill={item.isLiked ? '#ef4444' : 'none'} />{item.likes || 0}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 'var(--space-xl)' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="btn btn-ghost" style={{ padding: '6px 10px' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)' }}>
            {t('common.page', { current: page, total: totalPages })} ({t('common.items', { count: total })})
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="btn btn-ghost" style={{ padding: '6px 10px' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
