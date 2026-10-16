import { useMemo } from 'react';
import {
  Trophy, Target, Clock, CheckCircle, XCircle,
  RotateCcw, Zap, TrendingUp, Award, Brain,
} from 'lucide-react';

/**
 * QuizScoreBoard — Bảng điểm chi tiết cuối quiz
 * 
 * Features:
 * - Animated score ring (CSS-only circular progress)
 * - Breakdown per question type (MCQ, Fill, T/F)
 * - Bloom's taxonomy stats
 * - Time analysis
 * - Per-question review list
 * - Grade classification (A+, A, B...)
 */
export default function QuizScoreBoard({
  questions = [],
  answers = [],
  totalSeconds = 0,
  onRestart,
  onReviewQuestion,
}) {
  const analysis = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    const byType = {};
    const byBloom = {};
    const questionDetails = [];

    questions.forEach((q, i) => {
      const userAnswer = answers[i];
      const isCorrect = userAnswer?.isCorrect || false;
      if (isCorrect) correct++;
      else incorrect++;

      // Per type
      const type = q.question_type || 'mcq';
      if (!byType[type]) byType[type] = { correct: 0, total: 0 };
      byType[type].total++;
      if (isCorrect) byType[type].correct++;

      // Per Bloom level
      const bloom = q.bloom_level || 'remember';
      if (!byBloom[bloom]) byBloom[bloom] = { correct: 0, total: 0 };
      byBloom[bloom].total++;
      if (isCorrect) byBloom[bloom].correct++;

      questionDetails.push({
        index: i,
        question: q.question_text,
        type,
        bloom,
        isCorrect,
        userAnswer: userAnswer?.answer,
        correctAnswer: q.correct_answer,
        explanation: q.explanation || null,
        timeSpent: userAnswer?.timeSpent || 0,
      });
    });

    const total = questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const avgTime = total > 0 ? Math.round(totalSeconds / total) : 0;

    // Grade classification
    let grade, gradeColor, gradeLabel;
    if (percentage >= 95) { grade = 'A+'; gradeColor = '#34d399'; gradeLabel = 'Outstanding!'; }
    else if (percentage >= 90) { grade = 'A'; gradeColor = '#34d399'; gradeLabel = 'Excellent!'; }
    else if (percentage >= 80) { grade = 'B+'; gradeColor = '#6366f1'; gradeLabel = 'Great job!'; }
    else if (percentage >= 70) { grade = 'B'; gradeColor = '#818cf8'; gradeLabel = 'Good work!'; }
    else if (percentage >= 60) { grade = 'C'; gradeColor = '#fbbf24'; gradeLabel = 'Keep practicing'; }
    else if (percentage >= 50) { grade = 'D'; gradeColor = '#f97316'; gradeLabel = 'Needs improvement'; }
    else { grade = 'F'; gradeColor = '#f87171'; gradeLabel = 'Study more!'; }

    return { correct, incorrect, total, percentage, avgTime, byType, byBloom, questionDetails, grade, gradeColor, gradeLabel };
  }, [questions, answers, totalSeconds]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const TYPE_LABELS = { mcq: 'Multiple Choice', fill_blank: 'Fill in Blank', true_false: 'True / False' };
  const BLOOM_LABELS = {
    remember: 'Remember', understand: 'Understand', apply: 'Apply',
    analyze: 'Analyze', evaluate: 'Evaluate', create: 'Create',
    // Vietnamese Bloom names from backend
    'Nhớ': 'Nhớ', 'Hiểu': 'Hiểu', 'Áp dụng': 'Áp dụng',
    'Phân tích': 'Phân tích', 'Đánh giá': 'Đánh giá', 'Sáng tạo': 'Sáng tạo',
  };
  const BLOOM_COLORS = {
    remember: '#94a3b8', understand: '#6366f1', apply: '#8b5cf6',
    analyze: '#3b82f6', evaluate: '#f59e0b', create: '#34d399',
    // Vietnamese
    'Nhớ': '#94a3b8', 'Hiểu': '#6366f1', 'Áp dụng': '#8b5cf6',
    'Phân tích': '#3b82f6', 'Đánh giá': '#f59e0b', 'Sáng tạo': '#34d399',
  };

  return (
    <div style={{ padding: 'var(--space-xl)', overflowY: 'auto', height: '100%' }}>
      {/* ══════ Hero Score ══════ */}
      <div className="animate-scale-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        marginBottom: 'var(--space-2xl)', gap: 'var(--space-lg)',
      }}>
        {/* Score Ring */}
        <div style={{ position: 'relative', width: 140, height: 140 }}>
          <svg viewBox="0 0 140 140" style={{ width: 140, height: 140, transform: 'rotate(-90deg)' }}>
            <circle cx="70" cy="70" r="60" fill="none" stroke="var(--c-bg-tertiary)" strokeWidth="10" />
            <circle
              cx="70" cy="70" r="60" fill="none"
              stroke={analysis.gradeColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 60}`}
              strokeDashoffset={`${2 * Math.PI * 60 * (1 - analysis.percentage / 100)}`}
              style={{ transition: 'stroke-dashoffset 1.5s var(--ease-out-expo)', filter: `drop-shadow(0 0 8px ${analysis.gradeColor}40)` }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: analysis.gradeColor, lineHeight: 1 }}>
              {analysis.percentage}%
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: analysis.gradeColor, opacity: 0.8 }}>
              {analysis.grade}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 4 }}>
            {analysis.gradeLabel}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)' }}>
            {analysis.correct} / {analysis.total} correct
          </div>
        </div>
      </div>

      {/* ══════ Stats Cards ══════ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)',
        marginBottom: 'var(--space-xl)',
      }}>
        {[
          { icon: CheckCircle, label: 'Correct', value: analysis.correct, color: 'var(--c-success)', bg: 'var(--c-success-glow)' },
          { icon: XCircle, label: 'Incorrect', value: analysis.incorrect, color: 'var(--c-error)', bg: 'var(--c-error-glow)' },
          { icon: Clock, label: 'Total Time', value: formatTime(totalSeconds), color: 'var(--c-accent)', bg: 'var(--c-accent-glow)' },
        ].map((stat, i) => (
          <div key={i} className={`animate-fade-in-up stagger-${i + 1}`} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: 'var(--space-md)',
            background: stat.bg, borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--c-border)',
          }}>
            <stat.icon size={18} style={{ color: stat.color }} />
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: stat.color }}>{stat.value}</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* ══════ Type Breakdown ══════ */}
      {Object.keys(analysis.byType).length > 1 && (
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 'var(--space-md)' }}>
            By Question Type
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {Object.entries(analysis.byType).map(([type, data]) => (
              <div key={type} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                padding: '0.5rem 0.75rem',
                background: 'var(--c-bg-card)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--c-border)',
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)', flex: 1 }}>
                  {TYPE_LABELS[type] || type}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {data.correct}/{data.total}
                </span>
                <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--c-bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(data.correct / data.total) * 100}%`, height: '100%',
                    background: 'var(--c-success)', borderRadius: 2,
                    transition: 'width 0.5s var(--ease-out-expo)',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ Bloom's Taxonomy ══════ */}
      {Object.keys(analysis.byBloom).length > 0 && (
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 'var(--space-md)' }}>
            <Brain size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Bloom's Taxonomy
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
            {Object.entries(analysis.byBloom).map(([level, data]) => (
              <div key={level} style={{
                padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-full)',
                background: `${BLOOM_COLORS[level]}15`,
                border: `1px solid ${BLOOM_COLORS[level]}30`,
                fontSize: '0.6875rem', fontWeight: 600,
                color: BLOOM_COLORS[level],
              }}>
                {BLOOM_LABELS[level] || level}: {data.correct}/{data.total}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ Question Review ══════ */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 'var(--space-md)' }}>
          Question Review
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {analysis.questionDetails.map((qd, i) => (
            <div
              key={i}
              onClick={() => onReviewQuestion?.(i)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)',
                padding: 'var(--space-md)',
                background: 'var(--c-bg-card)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--c-border)',
                cursor: onReviewQuestion ? 'pointer' : 'default',
                transition: 'all var(--duration-fast)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: qd.isCorrect ? 'var(--c-success-glow)' : 'var(--c-error-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {qd.isCorrect
                  ? <CheckCircle size={13} style={{ color: 'var(--c-success)' }} />
                  : <XCircle size={13} style={{ color: 'var(--c-error)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.8125rem', color: 'var(--c-text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}>
                  Q{i + 1}. {qd.question}
                </div>
                {!qd.isCorrect && (
                  <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)' }}>
                    Your: <span style={{ color: 'var(--c-error)' }}>{qd.userAnswer || '—'}</span>
                    {' · '}
                    Correct: <span style={{ color: 'var(--c-success)' }}>{qd.correctAnswer}</span>
                  </div>
                )}
                {qd.explanation && (
                  <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                    💡 {qd.explanation}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: '0.625rem', color: 'var(--c-text-tertiary)',
                fontFamily: 'var(--font-mono)', flexShrink: 0,
              }}>
                {qd.timeSpent}s
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════ Actions ══════ */}
      <div style={{
        display: 'flex', gap: 'var(--space-md)', justifyContent: 'center',
        paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--c-border)',
      }}>
        <button className="btn btn-primary btn-lg" onClick={onRestart}>
          <RotateCcw size={16} /> Take Another Quiz
        </button>
      </div>
    </div>
  );
}
