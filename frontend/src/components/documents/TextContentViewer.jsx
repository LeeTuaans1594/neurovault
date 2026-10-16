import { useState, useCallback, useRef, useEffect } from 'react';
import { FileText, Highlighter, MessageSquare, ZoomIn, ZoomOut, Type, Copy, Check } from 'lucide-react';

const HIGHLIGHT_COLORS = {
  yellow: 'rgba(251, 191, 36, 0.25)',
  green: 'rgba(52, 211, 153, 0.25)',
  blue: 'rgba(96, 165, 250, 0.25)',
  pink: 'rgba(244, 114, 182, 0.25)',
  orange: 'rgba(251, 146, 60, 0.25)',
};

/**
 * TextContentViewer — Hiển thị nội dung text (TXT/MD/extracted PDF text)
 * Hỗ trợ text selection → tạo highlight annotation.
 * Props: text, annotations, onHighlight, fontSize
 */
export default function TextContentViewer({
  text = '',
  annotations = [],
  onHighlight,
  fontSize = 15,
}) {
  const contentRef = useRef(null);
  const [currentFontSize, setCurrentFontSize] = useState(fontSize);
  const [selectionPopup, setSelectionPopup] = useState(null);
  const [highlightColor, setHighlightColor] = useState('yellow');
  const [copied, setCopied] = useState(false);

  // Tăng/giảm font size
  const adjustFontSize = useCallback((delta) => {
    setCurrentFontSize(prev => Math.min(24, Math.max(11, prev + delta)));
  }, []);

  // Xử lý text selection → hiện popup
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) {
      setSelectionPopup(null);
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 2) {
      setSelectionPopup(null);
      return;
    }

    // Tính vị trí offset trong text
    const range = selection.getRangeAt(0);
    const preRange = document.createRange();
    preRange.setStart(contentRef.current, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    // Tính vị trí popup
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();

    setSelectionPopup({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
      selectedText,
      startOffset,
      endOffset,
    });
  }, []);

  const handleHighlightCreate = useCallback(() => {
    if (!selectionPopup) return;
    onHighlight?.({
      type: 'highlight',
      text_selection: {
        start_offset: selectionPopup.startOffset,
        end_offset: selectionPopup.endOffset,
        selected_text: selectionPopup.selectedText,
      },
      color: highlightColor,
    });
    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
  }, [selectionPopup, highlightColor, onHighlight]);

  const handleCopy = useCallback(() => {
    if (!selectionPopup) return;
    navigator.clipboard.writeText(selectionPopup.selectedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectionPopup]);

  // Render text với highlights overlay
  const renderHighlightedText = useCallback(() => {
    if (!text) return null;

    // Lọc annotations highlight có offset hợp lệ
    const highlights = annotations
      .filter(a => a.type === 'highlight' && a.text_selection?.start_offset >= 0)
      .sort((a, b) => a.text_selection.start_offset - b.text_selection.start_offset);

    if (highlights.length === 0) {
      return <span>{text}</span>;
    }

    // Xây dựng segments từ highlights
    const segments = [];
    let lastEnd = 0;

    for (const hl of highlights) {
      const start = hl.text_selection.start_offset;
      const end = hl.text_selection.end_offset;

      if (start < lastEnd) continue; // Bỏ qua overlap
      if (start >= text.length) continue;

      // Text trước highlight
      if (start > lastEnd) {
        segments.push({ text: text.slice(lastEnd, start), highlight: null });
      }

      // Highlighted text
      const actualEnd = Math.min(end, text.length);
      segments.push({
        text: text.slice(start, actualEnd),
        highlight: hl,
      });

      lastEnd = actualEnd;
    }

    // Text sau highlight cuối
    if (lastEnd < text.length) {
      segments.push({ text: text.slice(lastEnd), highlight: null });
    }

    return segments.map((seg, i) => {
      if (!seg.highlight) {
        return <span key={i}>{seg.text}</span>;
      }

      const bgColor = HIGHLIGHT_COLORS[seg.highlight.color] || HIGHLIGHT_COLORS.yellow;
      return (
        <mark
          key={i}
          title={seg.highlight.content || 'Highlight'}
          style={{
            background: bgColor,
            borderRadius: 2,
            padding: '1px 0',
            cursor: 'pointer',
            transition: 'background var(--duration-fast)',
          }}
        >
          {seg.text}
        </mark>
      );
    });
  }, [text, annotations]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        padding: 'var(--space-sm) var(--space-md)',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
        background: 'var(--c-bg-secondary)',
      }}>
        <Type size={14} style={{ color: 'var(--c-text-tertiary)' }} />
        <span style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary)' }}>
          {currentFontSize}px
        </span>
        <button
          onClick={() => adjustFontSize(-1)}
          className="btn btn-ghost btn-icon"
          style={{ width: 26, height: 26 }}
          title="Giảm cỡ chữ"
        >
          <ZoomOut size={12} />
        </button>
        <button
          onClick={() => adjustFontSize(1)}
          className="btn btn-ghost btn-icon"
          style={{ width: 26, height: 26 }}
          title="Tăng cỡ chữ"
        >
          <ZoomIn size={12} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-muted)' }}>
          Bôi đen text để tạo highlight
        </span>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        onMouseUp={handleMouseUp}
        style={{
          flex: 1, overflow: 'auto',
          padding: 'var(--space-xl) var(--space-2xl)',
          position: 'relative',
        }}
      >
        <pre style={{
          fontFamily: 'var(--font-sans)',
          fontSize: `${currentFontSize}px`,
          lineHeight: 1.85,
          color: 'var(--c-text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: 720,
          margin: '0 auto',
        }}>
          {renderHighlightedText()}
        </pre>

        {/* Selection Popup */}
        {selectionPopup && (
          <div
            className="animate-scale-in"
            style={{
              position: 'absolute',
              left: selectionPopup.x,
              top: selectionPopup.y,
              transform: 'translate(-50%, -100%)',
              background: 'var(--c-bg-elevated)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '6px 8px',
              display: 'flex', alignItems: 'center', gap: 4,
              boxShadow: 'var(--shadow-lg)',
              zIndex: 10,
            }}
          >
            {/* Color options */}
            {Object.entries(HIGHLIGHT_COLORS).map(([id, color]) => (
              <button
                key={id}
                onClick={() => setHighlightColor(id)}
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: color.replace('0.25', '0.7'),
                  border: highlightColor === id ? '2px solid var(--c-text-primary)' : '2px solid transparent',
                  cursor: 'pointer', transition: 'all var(--duration-fast)',
                }}
                title={id}
              />
            ))}
            <div style={{ width: 1, height: 20, background: 'var(--c-border)', margin: '0 2px' }} />
            <button
              onClick={handleHighlightCreate}
              title="Tạo highlight"
              style={{
                background: 'var(--c-accent-glow)', border: 'none',
                borderRadius: 'var(--radius-sm)', padding: '3px 8px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-accent)',
              }}
            >
              <Highlighter size={12} /> Highlight
            </button>
            <button
              onClick={handleCopy}
              title="Sao chép"
              style={{
                background: 'transparent', border: 'none',
                borderRadius: 'var(--radius-sm)', padding: '3px 6px',
                cursor: 'pointer', color: 'var(--c-text-tertiary)',
              }}
            >
              {copied ? <Check size={12} style={{ color: 'var(--c-success)' }} /> : <Copy size={12} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
