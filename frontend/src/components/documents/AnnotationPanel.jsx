import { useState } from 'react';
import {
  MessageSquare, Highlighter, Trash2, Pin, PinOff,
  Plus, X, ChevronDown, Loader2,
} from 'lucide-react';

const COLORS = [
  { id: 'yellow', hex: '#fbbf24', label: 'Vàng' },
  { id: 'green', hex: '#34d399', label: 'Xanh lá' },
  { id: 'blue', hex: '#60a5fa', label: 'Xanh dương' },
  { id: 'pink', hex: '#f472b6', label: 'Hồng' },
  { id: 'orange', hex: '#fb923c', label: 'Cam' },
];

/**
 * AnnotationPanel — Sidebar quản lý annotations (highlights + notes)
 * Props: annotations, onAdd, onUpdate, onDelete, isLoading
 */
export default function AnnotationPanel({
  annotations = [],
  onAdd,
  onUpdate,
  onDelete,
  isLoading = false,
}) {
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteColor, setNewNoteColor] = useState('yellow');
  const [filter, setFilter] = useState('all'); // all | highlight | note | bookmark

  const filtered = annotations.filter(a => {
    if (filter === 'all') return true;
    return a.type === filter;
  });

  const pinnedFirst = [...filtered].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    await onAdd?.({
      type: 'note',
      content: newNoteContent.trim(),
      color: newNoteColor,
    });
    setNewNoteContent('');
    setShowAddNote(false);
  };

  const getColorHex = (colorId) => COLORS.find(c => c.id === colorId)?.hex || '#fbbf24';

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins}p trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h trước`;
    return d.toLocaleDateString('vi-VN');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--c-bg-card)', borderLeft: '1px solid var(--c-border)',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-md) var(--space-lg)',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
          Ghi chú ({annotations.length})
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddNote(true)}
          style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
        >
          <Plus size={12} /> Thêm
        </button>
      </div>

      {/* Filter */}
      <div style={{
        padding: 'var(--space-sm) var(--space-lg)',
        display: 'flex', gap: 4, borderBottom: '1px solid var(--c-border)',
      }}>
        {[
          { id: 'all', label: 'Tất cả' },
          { id: 'highlight', label: 'Highlights' },
          { id: 'note', label: 'Notes' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.6875rem',
              fontWeight: filter === f.id ? 600 : 400,
              color: filter === f.id ? 'var(--c-accent)' : 'var(--c-text-tertiary)',
              background: filter === f.id ? 'var(--c-accent-glow)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', transition: 'all var(--duration-fast)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Add Note Form */}
      {showAddNote && (
        <div className="animate-fade-in" style={{
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-bg-secondary)',
        }}>
          <textarea
            value={newNoteContent}
            onChange={e => setNewNoteContent(e.target.value)}
            placeholder="Viết ghi chú..."
            autoFocus
            style={{
              width: '100%', minHeight: 80, resize: 'vertical',
              background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)',
              fontSize: '0.8125rem', color: 'var(--c-text-primary)',
              fontFamily: 'var(--font-sans)', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--c-border)'}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--space-sm)' }}>
            {COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => setNewNoteColor(c.id)}
                title={c.label}
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: c.hex, border: newNoteColor === c.id ? '2px solid var(--c-text-primary)' : '2px solid transparent',
                  cursor: 'pointer', transition: 'all var(--duration-fast)',
                }}
              />
            ))}
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddNote(false); setNewNoteContent(''); }}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}>
              Hủy
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAddNote}
              disabled={!newNoteContent.trim()}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem', opacity: newNoteContent.trim() ? 1 : 0.5 }}>
              Lưu
            </button>
          </div>
        </div>
      )}

      {/* Annotation List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-sm)' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-2xl)', gap: 8 }}>
            <Loader2 size={16} style={{ color: 'var(--c-accent)', animation: 'rotate-slow 1s linear infinite' }} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--c-text-tertiary)' }}>Đang tải...</span>
          </div>
        ) : pinnedFirst.length === 0 ? (
          <div style={{
            padding: 'var(--space-2xl)', textAlign: 'center',
            color: 'var(--c-text-tertiary)', fontSize: '0.8125rem',
          }}>
            <Highlighter size={24} style={{ margin: '0 auto var(--space-sm)', opacity: 0.4 }} />
            <div>Chưa có ghi chú nào</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
              Bôi đen text để tạo highlight, hoặc nhấn "Thêm" để viết ghi chú.
            </div>
          </div>
        ) : (
          pinnedFirst.map(ann => (
            <div
              key={ann._id}
              className="animate-fade-in"
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                marginBottom: 'var(--space-xs)',
                borderRadius: 'var(--radius-md)',
                borderLeft: `3px solid ${getColorHex(ann.color)}`,
                background: 'var(--c-bg-secondary)',
                transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg-tertiary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--c-bg-secondary)'}
            >
              {/* Selected text preview */}
              {ann.text_selection?.selected_text && (
                <div style={{
                  fontSize: '0.75rem', color: 'var(--c-text-tertiary)',
                  fontStyle: 'italic', marginBottom: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  "{ann.text_selection.selected_text}"
                </div>
              )}

              {/* Note content */}
              {ann.content && (
                <div style={{
                  fontSize: '0.8125rem', color: 'var(--c-text-primary)',
                  lineHeight: 1.5, marginBottom: 4,
                }}>
                  {ann.content}
                </div>
              )}

              {/* Actions */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                marginTop: 4,
              }}>
                <span style={{ fontSize: '0.625rem', color: 'var(--c-text-muted)' }}>
                  {formatTime(ann.createdAt)}
                </span>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => onUpdate?.(ann._id, { is_pinned: !ann.is_pinned })}
                  title={ann.is_pinned ? 'Bỏ ghim' : 'Ghim'}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: 2, borderRadius: 4,
                    color: ann.is_pinned ? 'var(--c-accent)' : 'var(--c-text-muted)',
                  }}
                >
                  {ann.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
                </button>
                <button
                  onClick={() => onDelete?.(ann._id)}
                  title="Xóa"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: 2, borderRadius: 4, color: 'var(--c-text-muted)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--c-error)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--c-text-muted)'}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
