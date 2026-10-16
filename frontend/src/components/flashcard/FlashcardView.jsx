import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layers, RotateCcw, ThumbsDown, ThumbsUp, Zap, Check,
  Loader2, ArrowLeft, ArrowRight, Keyboard, Clock,
  Brain, Target, TrendingUp, Flame, Star,
} from 'lucide-react';
import { aiAPI, learningAPI } from '../../services/api';

/**
 * FlashcardView v2 — 3D Flip + Swipe Gestures + FSRS Buttons
 *
 * Tính năng:
 * - 3D CSS flip animation (perspective + preserve-3d)
 * - Touch/mouse swipe gestures với visual feedback
 * - FSRS v6 rating buttons (Again/Hard/Good/Easy) + interval preview
 * - Card stack deck visual (pseudo-elements)
 * - Keyboard shortcuts: Space=flip, 1-4=rate, ←→=navigate
 * - Session stats tracking (correct/wrong/streaks)
 * - Difficulty & card type badges
 * - Learning activity recording
 */

// ── FSRS Rating Config ──
const RATINGS = [
  {
    value: 1,
    label: 'Again',
    desc: 'Quên hoàn toàn',
    key: '1',
    className: 'again',
    icon: RotateCcw,
    interval: '< 1 phút',
  },
  {
    value: 2,
    label: 'Hard',
    desc: 'Nhớ mang máng',
    key: '2',
    className: 'hard',
    icon: ThumbsDown,
    interval: '~1 ngày',
  },
  {
    value: 3,
    label: 'Good',
    desc: 'Nhớ được',
    key: '3',
    className: 'good',
    icon: ThumbsUp,
    interval: '~3 ngày',
  },
  {
    value: 4,
    label: 'Easy',
    desc: 'Dễ dàng',
    key: '4',
    className: 'easy',
    icon: Zap,
    interval: '~7 ngày',
  },
];

// ── Swipe threshold (px) ──
const SWIPE_THRESHOLD = 80;

export default function FlashcardView({ documentId }) {
  // ── Core State ──
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [maxCards, setMaxCards] = useState(10);

  // ── Session Stats ──
  const [ratings, setRatings] = useState([]); // array of rating values (1-4) per card
  const [sessionStart, setSessionStart] = useState(null);

  // ── Swipe/Drag State ──
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);
  const cardRef = useRef(null);

  // ── Derived ──
  const card = cards[currentIndex] || null;
  const isSessionDone = started && currentIndex >= cards.length && cards.length > 0;
  const totalReviewed = ratings.length;

  // ── Generate flashcards từ AI ──
  const generateCards = async () => {
    try {
      setIsLoading(true);
      setError('');
      setStarted(true);
      setRatings([]);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionStart(Date.now());

      const data = await aiAPI.generateFlashcards(documentId, maxCards);

      if (data.flashcards && data.flashcards.length > 0) {
        setCards(data.flashcards);
      } else {
        setError('Không tạo được flashcard. Tài liệu có thể cần thêm nội dung.');
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo flashcards. Kiểm tra AI server đang chạy.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Handle FSRS Rating ──
  const handleRate = useCallback(async (ratingValue) => {
    if (!card || !isFlipped) return;

    // Lưu rating cho card này
    setRatings(prev => [...prev, ratingValue]);

    // Gọi FSRS scheduling API
    try {
      const cardState = {
        rating: ratingValue,
        stability: card.fsrs_stability || 1.0,
        difficulty: card.fsrs_difficulty || 5.0,
        elapsed_days: 0,
        review_count: 1,
      };
      await aiAPI.scheduleReview(
        cardState.rating,
        cardState.stability,
        cardState.difficulty,
        cardState.elapsed_days,
        cardState.review_count
      );
    } catch {
      // FSRS API fail — không block UX, card vẫn chuyển tiếp
    }

    // Chuyển card tiếp theo
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      setDragX(0);
    } else {
      // Session hoàn thành — ghi nhận activity
      setCurrentIndex(cards.length);
      recordSession(ratingValue);
    }
  }, [card, isFlipped, currentIndex, cards.length]);

  // ── Record session to backend ──
  const recordSession = async (lastRating) => {
    const allRatings = [...ratings, lastRating];
    const durationSeconds = sessionStart
      ? Math.round((Date.now() - sessionStart) / 1000)
      : 0;

    try {
      await learningAPI.recordActivity('flashcard', documentId, durationSeconds, {
        cards_reviewed: allRatings.length,
        ratings_distribution: {
          again: allRatings.filter(r => r === 1).length,
          hard: allRatings.filter(r => r === 2).length,
          good: allRatings.filter(r => r === 3).length,
          easy: allRatings.filter(r => r === 4).length,
        },
        average_rating: allRatings.reduce((a, b) => a + b, 0) / allRatings.length,
      });
    } catch {
      // Activity recording fail — không block UX
    }
  };

  // ── Flip Card ──
  const flipCard = useCallback(() => {
    if (card && !isDragging) setIsFlipped(prev => !prev);
  }, [card, isDragging]);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    if (!started || isSessionDone) return;

    const handleKeyDown = (e) => {
      // Space = flip
      if (e.code === 'Space') {
        e.preventDefault();
        flipCard();
        return;
      }

      // 1-4 = rate (chỉ khi đã flip)
      if (isFlipped && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        handleRate(parseInt(e.key));
        return;
      }

      // Arrow left = previous card (nếu chưa flip)
      if (e.key === 'ArrowLeft' && currentIndex > 0 && !isFlipped) {
        e.preventDefault();
        setCurrentIndex(prev => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [started, isSessionDone, isFlipped, flipCard, handleRate, currentIndex]);

  // ── Touch/Mouse Swipe Handling ──
  const handleDragStart = (clientX) => {
    if (isFlipped) return; // Chỉ swipe khi chưa flip
    dragStartRef.current = clientX;
    setIsDragging(true);
  };

  const handleDragMove = (clientX) => {
    if (!isDragging || dragStartRef.current === null) return;
    const dx = clientX - dragStartRef.current;
    setDragX(dx);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStartRef.current = null;

    // Nếu swipe đủ xa → flip card
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      flipCard();
    }

    setDragX(0);
  };

  // Mouse events
  const onMouseDown = (e) => handleDragStart(e.clientX);
  const onMouseMove = (e) => { if (isDragging) handleDragMove(e.clientX); };
  const onMouseUp = () => handleDragEnd();

  // Touch events
  const onTouchStart = (e) => handleDragStart(e.touches[0].clientX);
  const onTouchMove = (e) => handleDragMove(e.touches[0].clientX);
  const onTouchEnd = () => handleDragEnd();

  // Swipe intensity cho visual feedback
  const swipeIntensity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const swipeDirection = dragX > 0 ? 'right' : dragX < 0 ? 'left' : null;

  // ── Compute session stats ──
  const sessionStats = {
    again: ratings.filter(r => r === 1).length,
    hard: ratings.filter(r => r === 2).length,
    good: ratings.filter(r => r === 3).length,
    easy: ratings.filter(r => r === 4).length,
    total: ratings.length,
    avgRating: ratings.length > 0
      ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
      : 0,
    duration: sessionStart
      ? Math.round((Date.now() - sessionStart) / 1000)
      : 0,
  };

  // ── Format duration ──
  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  // ── Card difficulty label ──
  const getDifficultyLabel = (diff) => {
    if (!diff && diff !== 0) return null;
    if (diff <= 0.3) return { text: 'Dễ', color: '#34d399' };
    if (diff <= 0.6) return { text: 'Trung bình', color: '#fbbf24' };
    return { text: 'Khó', color: '#f87171' };
  };

  // ═══════════════════════════════════════
  // RENDER: Session Complete
  // ═══════════════════════════════════════
  if (isSessionDone) {
    const passRate = sessionStats.total > 0
      ? Math.round(((sessionStats.good + sessionStats.easy) / sessionStats.total) * 100)
      : 0;

    return (
      <div className="fc-complete animate-fade-in-up" style={{ height: '100%', justifyContent: 'center' }}>
        {/* Icon */}
        <div className="fc-complete-icon">
          <Check size={40} style={{ color: 'var(--c-success)' }} strokeWidth={2.5} />
        </div>

        {/* Title */}
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 4 }}>
            Phiên ôn tập hoàn tất! 🎉
          </div>
          <div style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)' }}>
            {sessionStats.total} thẻ đã ôn · {formatDuration(sessionStats.duration)}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="fc-stats-grid">
          <div className="fc-stat-item">
            <Target size={18} style={{ color: '#34d399' }} />
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{passRate}%</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>Đạt</span>
          </div>
          <div className="fc-stat-item">
            <TrendingUp size={18} style={{ color: 'var(--c-accent)' }} />
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{sessionStats.avgRating}</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>TB Rating</span>
          </div>
          <div className="fc-stat-item">
            <Clock size={18} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text-primary)' }}>{formatDuration(sessionStats.duration)}</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>Thời gian</span>
          </div>
        </div>

        {/* Rating Distribution */}
        <div style={{
          display: 'flex', gap: 'var(--space-md)', justifyContent: 'center',
          padding: 'var(--space-md)', borderRadius: 'var(--radius-lg)',
          background: 'var(--c-bg-secondary)', border: '1px solid var(--c-border)',
          maxWidth: 400, width: '100%',
        }}>
          {RATINGS.map(r => {
            const count = ratings.filter(v => v === r.value).length;
            const colorMap = { again: '#f87171', hard: '#fb923c', good: '#34d399', easy: '#818cf8' };
            return (
              <div key={r.value} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                <span style={{
                  fontSize: '1.125rem', fontWeight: 700,
                  color: colorMap[r.className] || 'var(--c-text-primary)',
                }}>
                  {count}
                </span>
                <span style={{ fontSize: '0.625rem', color: 'var(--c-text-tertiary)' }}>{r.label}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <button className="btn btn-primary" onClick={() => { setStarted(false); setRatings([]); setCards([]); setCurrentIndex(0); }}>
            <RotateCcw size={16} /> Ôn lại
          </button>
          <button className="btn btn-ghost" onClick={generateCards}>
            <Layers size={16} /> Bộ thẻ mới
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: Start Screen
  // ═══════════════════════════════════════
  if (!started || cards.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-xl)',
        padding: 'var(--space-xl)',
      }}>
        {/* Icon */}
        <div style={{
          width: 80, height: 80, borderRadius: 'var(--radius-xl)',
          background: 'rgba(16,185,129,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'float 6s ease-in-out infinite',
        }}>
          <Layers size={36} style={{ color: '#10b981' }} strokeWidth={1.5} />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 8 }}>
            Flashcard Study
          </h3>
          <p style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)', maxWidth: 440, lineHeight: 1.7 }}>
            Thẻ ghi nhớ AI tạo tự động từ tài liệu, kết hợp thuật toán FSRS v6
            để tối ưu lịch ôn tập. Lật thẻ → đánh giá mức nhớ → AI lên lịch review.
          </p>
        </div>

        {/* Config */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
          padding: 'var(--space-md) var(--space-lg)',
          borderRadius: 'var(--radius-lg)', background: 'var(--c-bg-secondary)',
          border: '1px solid var(--c-border)',
        }}>
          <label style={{ fontSize: '0.8125rem', color: 'var(--c-text-secondary)', fontWeight: 500 }}>
            Số thẻ:
          </label>
          <select
            value={maxCards}
            onChange={e => setMaxCards(Number(e.target.value))}
            style={{
              padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--c-border)', fontSize: '0.875rem',
              background: 'var(--c-bg-card)', color: 'var(--c-text-primary)',
              fontFamily: 'var(--font-sans)', cursor: 'pointer',
            }}
          >
            {[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Keyboard hint */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
          fontSize: '0.75rem', color: 'var(--c-text-tertiary)',
        }}>
          <Keyboard size={14} />
          <span>Space = lật · 1-4 = đánh giá · Swipe = lật thẻ</span>
        </div>

        {/* Generate button */}
        <button className="btn btn-primary btn-lg" onClick={generateCards} disabled={isLoading}>
          {isLoading ? (
            <><Loader2 size={18} style={{ animation: 'rotate-slow 1s linear infinite' }} /> Đang tạo...</>
          ) : (
            <><Layers size={18} /> Tạo Flashcards</>
          )}
        </button>

        {error && (
          <div className="animate-fade-in" style={{
            color: 'var(--c-error)', fontSize: '0.875rem',
            padding: 'var(--space-md)', borderRadius: 'var(--radius-md)',
            background: 'var(--c-error-glow)', border: '1px solid rgba(248,113,113,0.15)',
            maxWidth: 400, textAlign: 'center',
          }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: Loading
  // ═══════════════════════════════════════
  if (isLoading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-lg)',
      }}>
        <Loader2 size={36} style={{ color: 'var(--c-accent)', animation: 'rotate-slow 1s linear infinite' }} />
        <div style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)' }}>
          AI đang tạo flashcards từ tài liệu...
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: Study Mode
  // ═══════════════════════════════════════
  if (!card) return null;

  const diffLabel = getDifficultyLabel(card.difficulty);
  const remainingCards = cards.length - currentIndex - 1;

  // Tính transform khi drag (tilt effect nhẹ)
  const dragRotation = isDragging ? dragX * 0.05 : 0;
  const dragStyle = isDragging
    ? { transform: `translateX(${dragX}px) rotateZ(${dragRotation}deg)` }
    : {};

  return (
    <div
      className="animate-fade-in-up"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%',
        padding: 'var(--space-lg)', gap: 'var(--space-lg)',
      }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* ── Progress Bar ── */}
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.8125rem', color: 'var(--c-text-secondary)', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <span style={{ fontWeight: 600 }}>
              Thẻ {currentIndex + 1} / {cards.length}
            </span>
            {remainingCards > 0 && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>
                · còn {remainingCards}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            {/* Card type badge */}
            {card.card_type && (
              <span className="badge badge-accent">{card.card_type}</span>
            )}
            {/* Difficulty badge */}
            {diffLabel && (
              <span style={{
                fontSize: '0.625rem', fontWeight: 600,
                padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
                background: `${diffLabel.color}15`, color: diffLabel.color,
              }}>
                {diffLabel.text}
              </span>
            )}
            {/* New deck button */}
            <button
              onClick={generateCards}
              title="Generate new flashcard deck"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--c-border)', cursor: 'pointer',
                background: 'var(--c-bg-secondary)', color: 'var(--c-text-secondary)',
                fontSize: '0.625rem', fontWeight: 500,
                transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.color = '#10b981'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-secondary)'; }}
            >
              <RotateCcw size={10} /> New Deck
            </button>
          </div>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Card Stack + 3D Card ── */}
      <div className="fc-stack">
        <div
          ref={cardRef}
          className="flashcard-container"
          onClick={() => { if (!isDragging) flipCard(); }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={dragStyle}
        >
          <div className={`flashcard-inner ${isFlipped ? 'flipped' : ''} ${isDragging ? 'dragging' : ''}`}>
            {/* Front */}
            <div className="flashcard-front">
              {/* Swipe hints */}
              {isDragging && swipeDirection === 'left' && (
                <div className="fc-swipe-hint left" style={{ opacity: swipeIntensity * 0.8 }}>
                  ↩ Lật
                </div>
              )}
              {isDragging && swipeDirection === 'right' && (
                <div className="fc-swipe-hint right" style={{ opacity: swipeIntensity * 0.8 }}>
                  Lật ↪
                </div>
              )}

              <div style={{
                fontSize: '0.625rem', fontWeight: 700, color: 'var(--c-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-md)',
              }}>
                Câu hỏi
              </div>
              <div style={{
                fontSize: '1.125rem', fontWeight: 500, color: 'var(--c-text-primary)',
                textAlign: 'center', lineHeight: 1.7, maxWidth: 400,
              }}>
                {card.front}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: '0.6875rem', color: 'var(--c-text-muted)',
                marginTop: 'auto', paddingTop: 'var(--space-lg)',
              }}>
                <span>Nhấn hoặc Space để lật</span>
              </div>
            </div>

            {/* Back */}
            <div className="flashcard-back">
              <div style={{
                fontSize: '0.625rem', fontWeight: 700, opacity: 0.6,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                marginBottom: 'var(--space-md)',
              }}>
                Đáp án
              </div>
              <div style={{
                fontSize: '1.125rem', fontWeight: 500, textAlign: 'center',
                lineHeight: 1.7, maxWidth: 400,
              }}>
                {card.back}
              </div>
              {card.explanation && (
                <div style={{
                  fontSize: '0.8125rem', opacity: 0.7, marginTop: 'var(--space-lg)',
                  fontStyle: 'italic', textAlign: 'center', maxWidth: 380,
                  lineHeight: 1.6,
                }}>
                  💡 {card.explanation}
                </div>
              )}
              <div style={{
                fontSize: '0.6875rem', opacity: 0.4, marginTop: 'auto',
                paddingTop: 'var(--space-lg)',
              }}>
                Đánh giá mức nhớ bên dưới ↓
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rating Buttons (chỉ hiện khi đã flip) ── */}
      {isFlipped && (
        <div className="fc-rating-bar animate-fade-in-up">
          {RATINGS.map(r => {
            const RIcon = r.icon;
            return (
              <button
                key={r.value}
                className={`fc-rating-btn ${r.className}`}
                onClick={(e) => { e.stopPropagation(); handleRate(r.value); }}
                title={`${r.label} — ${r.desc} (phím ${r.key})`}
              >
                <span className="fc-rating-key">{r.key}</span>
                <RIcon size={20} style={{ color: 'var(--btn-color)' }} />
                <span className="fc-rating-label">{r.label}</span>
                <span className="fc-rating-interval">{r.interval}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Mini session stats bar ── */}
      {totalReviewed > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
          fontSize: '0.6875rem', color: 'var(--c-text-tertiary)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Check size={11} style={{ color: '#34d399' }} />
            {sessionStats.good + sessionStats.easy} đạt
          </span>
          <span style={{ color: 'var(--c-border)' }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <RotateCcw size={11} style={{ color: '#f87171' }} />
            {sessionStats.again + sessionStats.hard} cần ôn
          </span>
          <span style={{ color: 'var(--c-border)' }}>·</span>
          <span>{formatDuration(sessionStats.duration)}</span>
        </div>
      )}
    </div>
  );
}
