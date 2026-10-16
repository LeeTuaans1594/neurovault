import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  HelpCircle, CheckCircle, XCircle, ArrowRight, RotateCcw,
  Trophy, Loader2, Clock, Brain, Zap, AlertCircle,
  ChevronDown, Lightbulb, Check, X, Activity, TrendingUp,
} from 'lucide-react';
import { aiAPI, learningAPI } from '../../services/api';
import QuizTimer, { useQuizTimer } from './QuizTimer';
import QuizScoreBoard from './QuizScoreBoard';

/**
 * QuizView v3 — Premium Quiz Interface + Adaptive Mode
 * 
 * Features:
 * - Adaptive IRT mode (real-time difficulty adjustment)
 * - Timer (total + per-question optional countdown)
 * - 3 question types: MCQ, Fill-in-blank, True/False
 * - Bloom's Taxonomy badges
 * - Live difficulty/ability indicators
 * - Explanations after answering
 * - Difficulty selector (Easy/Medium/Hard)
 * - Question type filter
 * - Animated transitions
 * - Detailed score board
 * - Record activity to backend
 */

const DIFFICULTY_OPTIONS = [
  { value: 0.3, label: 'Easy', color: '#34d399', icon: '🟢' },
  { value: 0.5, label: 'Medium', color: '#fbbf24', icon: '🟡' },
  { value: 0.8, label: 'Hard', color: '#f87171', icon: '🔴' },
];

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

export default function QuizView({ documentId }) {
  // ── Config state ──
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState(0.5);
  const [enableTimer, setEnableTimer] = useState(false);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [adaptiveMode, setAdaptiveMode] = useState(false);

  // ── Quiz state ──
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]); // { answer, isCorrect, timeSpent }
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [fillAnswer, setFillAnswer] = useState('');
  const [shuffledOptions, setShuffledOptions] = useState([]);

  // ── Adaptive state ──
  const [adaptiveSession, setAdaptiveSession] = useState(null);
  const [abilityLevel, setAbilityLevel] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState(0.5);
  const [confidenceLevel, setConfidenceLevel] = useState('...');

  // ── Timer ──
  const timer = useQuizTimer();
  const questionStartRef = useRef(Date.now());

  // ── Shuffle options khi chuyển câu ──
  useEffect(() => {
    if (questions.length === 0 || currentIndex >= questions.length) return;
    const q = questions[currentIndex];
    if (q.question_type === 'mcq') {
      const opts = [q.correct_answer, ...(q.distractors || [])];
      setShuffledOptions(shuffleArray(opts));
    } else if (q.question_type === 'true_false') {
      // Detect language from correct_answer — backend returns 'Đúng'/'Sai' for Vietnamese
      const isVi = q.correct_answer === 'Đúng' || q.correct_answer === 'Sai';
      setShuffledOptions(isVi ? ['Đúng', 'Sai'] : ['True', 'False']);
    } else {
      setShuffledOptions([]);
    }
    questionStartRef.current = Date.now();
  }, [currentIndex, questions]);

  // ── Generate quiz ──
  const generateQuiz = async () => {
    try {
      setIsLoading(true);
      setError('');
      setStarted(true);

      if (adaptiveMode) {
        // Adaptive IRT mode
        const data = await aiAPI.startAdaptiveQuiz(documentId, 'default', numQuestions);
        if (data.session_id && data.current_question) {
          setAdaptiveSession(data);
          setQuestions([data.current_question]);
          setAbilityLevel(data.ability || 0);
          setCurrentDifficulty(data.current_question.difficulty || 0.5);
          setCurrentIndex(0);
          setAnswers([]);
          setIsFinished(false);
          setSelectedAnswer(null);
          setShowResult(false);
          setFillAnswer('');
          timer.start();
        } else {
          setError('Could not start adaptive quiz. Try standard mode.');
        }
      } else {
        // Standard mode
        const data = await aiAPI.generateQuiz(documentId, numQuestions, difficulty);
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
          setCurrentIndex(0);
          setAnswers([]);
          setIsFinished(false);
          setSelectedAnswer(null);
          setShowResult(false);
          setFillAnswer('');
          timer.start();
        } else {
          setError('No questions generated. The document may need more content.');
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to generate quiz. Make sure AI server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Handle answer ──
  const handleAnswer = useCallback((answer) => {
    if (showResult) return;
    const q = questions[currentIndex];
    const timeSpent = Math.round((Date.now() - questionStartRef.current) / 1000);
    
    let isCorrect = false;
    if (q.question_type === 'fill_blank') {
      isCorrect = answer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
    } else {
      isCorrect = answer === q.correct_answer;
    }

    setSelectedAnswer(answer);
    setShowResult(true);
    setAnswers(prev => [...prev, { answer, isCorrect, timeSpent }]);
  }, [showResult, questions, currentIndex]);

  // ── Time up handler ──
  const handleTimeUp = useCallback(() => {
    if (!showResult) {
      const timeSpent = Math.round((Date.now() - questionStartRef.current) / 1000);
      setSelectedAnswer(null);
      setShowResult(true);
      setAnswers(prev => [...prev, { answer: null, isCorrect: false, timeSpent }]);
    }
  }, [showResult]);

  // ── Next question ──
  const handleNext = async () => {
    if (adaptiveMode && adaptiveSession) {
      // Adaptive: submit answer to get next question
      try {
        const timeSpent = Math.round((Date.now() - questionStartRef.current));
        const lastAnswer = answers[answers.length - 1];
        const result = await aiAPI.submitAdaptiveAnswer(
          adaptiveSession.session_id,
          lastAnswer?.answer || '',
          timeSpent,
        );

        if (result.status === 'completed' || result.is_finished) {
          timer.stop();
          setIsFinished(true);
          setAbilityLevel(result.final_ability || abilityLevel);
          setConfidenceLevel(result.ability_label || '...');
          // Record activity
          try {
            const correct = answers.filter(a => a.isCorrect).length;
            await learningAPI.recordActivity('quiz', documentId, timer.getElapsed(), {
              quiz: {
                total_questions: answers.length,
                correct_answers: correct,
                score_percentage: Math.round((correct / answers.length) * 100),
                difficulty,
                mode: 'adaptive',
                final_ability: result.final_ability,
              },
            });
          } catch (e) {
            console.warn('Could not record quiz activity:', e.message);
          }
        } else if (result.current_question) {
          setQuestions(prev => [...prev, result.current_question]);
          setCurrentIndex(prev => prev + 1);
          setSelectedAnswer(null);
          setShowResult(false);
          setFillAnswer('');
          setAbilityLevel(result.ability || abilityLevel);
          setCurrentDifficulty(result.current_question.difficulty || currentDifficulty);
          setConfidenceLevel(result.ability_label || confidenceLevel);
        }
      } catch (err) {
        console.warn('Adaptive quiz error:', err.message);
        timer.stop();
        setIsFinished(true);
      }
    } else if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setFillAnswer('');
    } else {
      timer.stop();
      setIsFinished(true);
      // Record activity
      try {
        const correct = answers.filter(a => a.isCorrect).length;
        await learningAPI.recordActivity('quiz', documentId, timer.getElapsed(), {
          quiz: {
            total_questions: questions.length,
            correct_answers: correct,
            score_percentage: Math.round((correct / questions.length) * 100),
            difficulty,
          },
        });
      } catch (e) {
        console.warn('Could not record quiz activity:', e.message);
      }
    }
  };

  // ── Restart ──
  const restart = () => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setAnswers([]);
    setIsFinished(false);
    setStarted(false);
    setQuestions([]);
    setFillAnswer('');
    setAdaptiveSession(null);
    setAbilityLevel(0);
    setCurrentDifficulty(0.5);
    setConfidenceLevel('...');
    timer.stop();
  };

  // ══════════════════════════════════════════
  // RENDER: Start Screen
  // ══════════════════════════════════════════
  if (!started) {
    return (
      <div className="animate-fade-in-up" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-xl)',
        padding: 'var(--space-xl)',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 'var(--radius-xl)',
          background: 'rgba(139,92,246,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Brain size={36} style={{ color: '#8b5cf6' }} strokeWidth={1.5} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 8 }}>
            AI Quiz Generator
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)', maxWidth: 420 }}>
            Generate quiz questions powered by Bloom's Taxonomy. Supports MCQ, Fill-in-blank, and True/False.
          </p>
        </div>

        {/* Config Panel */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)',
          width: '100%', maxWidth: 400,
          padding: 'var(--space-xl)',
          background: 'var(--c-bg-card)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--c-border)',
        }}>
          {/* Questions count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)' }}>
              Questions
            </label>
            <select
              value={numQuestions}
              onChange={e => setNumQuestions(Number(e.target.value))}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--c-border)', fontSize: '0.8125rem',
                background: 'var(--c-bg-secondary)', color: 'var(--c-text-primary)',
                fontFamily: 'var(--font-sans)', cursor: 'pointer',
              }}
            >
              {[3, 5, 10, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Difficulty */}
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)', marginBottom: 8, display: 'block' }}>
              Difficulty
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              {DIFFICULTY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDifficulty(opt.value)}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${difficulty === opt.value ? opt.color : 'var(--c-border)'}`,
                    background: difficulty === opt.value ? `${opt.color}15` : 'transparent',
                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                    color: difficulty === opt.value ? opt.color : 'var(--c-text-tertiary)',
                    transition: 'all var(--duration-fast)',
                  }}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timer toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--c-text-secondary)' }}>
              <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Timer per question
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              {enableTimer && (
                <select
                  value={timePerQuestion}
                  onChange={e => setTimePerQuestion(Number(e.target.value))}
                  style={{
                    padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--c-border)', fontSize: '0.75rem',
                    background: 'var(--c-bg-secondary)', color: 'var(--c-text-primary)',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {[15, 30, 45, 60, 90].map(s => <option key={s} value={s}>{s}s</option>)}
                </select>
              )}
              <button
                onClick={() => setEnableTimer(!enableTimer)}
                style={{
                  width: 40, height: 22, borderRadius: 11,
                  border: 'none', cursor: 'pointer',
                  background: enableTimer ? 'var(--c-accent)' : 'var(--c-bg-tertiary)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', background: 'white',
                  position: 'absolute', top: 3,
                  left: enableTimer ? 21 : 3,
                  transition: 'left 0.2s var(--ease-spring)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" onClick={generateQuiz} style={{ minWidth: 200 }}>
          <Zap size={18} /> {adaptiveMode ? 'Start Adaptive Quiz' : 'Start Quiz'}
        </button>

        {/* Adaptive Mode Toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
          padding: 'var(--space-md) var(--space-lg)',
          borderRadius: 'var(--radius-lg)', background: adaptiveMode ? 'rgba(139,92,246,0.08)' : 'var(--c-bg-secondary)',
          border: `1px solid ${adaptiveMode ? 'rgba(139,92,246,0.3)' : 'var(--c-border)'}`,
          transition: 'all 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} style={{ color: adaptiveMode ? '#8b5cf6' : 'var(--c-text-tertiary)' }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: adaptiveMode ? '#8b5cf6' : 'var(--c-text-secondary)' }}>
              Adaptive IRT Mode
            </span>
          </div>
          <button
            onClick={() => setAdaptiveMode(!adaptiveMode)}
            style={{
              width: 40, height: 22, borderRadius: 11,
              border: 'none', cursor: 'pointer',
              background: adaptiveMode ? '#8b5cf6' : 'var(--c-bg-tertiary)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%', background: 'white',
              position: 'absolute', top: 3,
              left: adaptiveMode ? 21 : 3,
              transition: 'left 0.2s var(--ease-spring)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
        {adaptiveMode && (
          <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', textAlign: 'center', maxWidth: 360 }}>
            AI adjusts difficulty in real-time based on your performance using Item Response Theory (IRT)
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // RENDER: Loading
  // ══════════════════════════════════════════
  if (isLoading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-lg)',
      }}>
        <Loader2 size={36} style={{ color: 'var(--c-accent)', animation: 'rotate-slow 1s linear infinite' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 4 }}>
            Generating Quiz...
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-tertiary)' }}>
            AI is creating {numQuestions} questions using Bloom's Taxonomy
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // RENDER: Error
  // ══════════════════════════════════════════
  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 'var(--space-lg)',
      }}>
        <AlertCircle size={36} style={{ color: 'var(--c-error)' }} />
        <div style={{ color: 'var(--c-error)', fontSize: '0.9375rem', textAlign: 'center', maxWidth: 400 }}>{error}</div>
        <button className="btn btn-ghost" onClick={restart}>
          <RotateCcw size={16} /> Try Again
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // RENDER: Score Board
  // ══════════════════════════════════════════
  if (isFinished) {
    return (
      <QuizScoreBoard
        questions={questions}
        answers={answers}
        totalSeconds={timer.getElapsed()}
        onRestart={restart}
      />
    );
  }

  // ══════════════════════════════════════════
  // RENDER: Active Question
  // ══════════════════════════════════════════
  const q = questions[currentIndex];
  const score = answers.filter(a => a.isCorrect).length;
  const bloomLevel = q.bloom_level || 'remember';
  const bloomColor = BLOOM_COLORS[bloomLevel] || '#94a3b8';

  return (
    <div style={{ padding: 'var(--space-lg)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header: Progress + Timer + Score ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--space-md)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-secondary)' }}>
            {currentIndex + 1} / {questions.length}
          </span>
          {/* Bloom badge */}
          <span style={{
            padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)',
            fontSize: '0.625rem', fontWeight: 600,
            background: `${bloomColor}18`, color: bloomColor,
            border: `1px solid ${bloomColor}30`,
          }}>
            {BLOOM_LABELS[bloomLevel] || bloomLevel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <QuizTimer
            timeLimit={enableTimer ? timePerQuestion : 0}
            isRunning={!showResult}
            onTimeUp={handleTimeUp}
            questionIndex={currentIndex}
          />
          {/* Adaptive difficulty indicator */}
          {adaptiveMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)',
              background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
            }}>
              <TrendingUp size={11} style={{ color: '#8b5cf6' }} />
              <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#8b5cf6', fontFamily: 'var(--font-mono)' }}>
                θ {abilityLevel > 0 ? '+' : ''}{abilityLevel.toFixed(1)}
              </span>
            </div>
          )}
          <span style={{
            fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-success)',
            fontFamily: 'var(--font-mono)',
          }}>
            {score} pts
          </span>
          <button
            onClick={generateQuiz}
            title="Generate new quiz"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--c-border)', cursor: 'pointer',
              background: 'var(--c-bg-secondary)', color: 'var(--c-text-secondary)',
              fontSize: '0.6875rem', fontWeight: 500,
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-accent)'; e.currentTarget.style.color = 'var(--c-accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-secondary)'; }}
          >
            <RotateCcw size={12} /> New Quiz
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar" style={{ marginBottom: 'var(--space-lg)', flexShrink: 0 }}>
        <div className="progress-bar-fill" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
      </div>

      {/* ── Question Body ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Type badge */}
        <div style={{
          fontSize: '0.625rem', fontWeight: 600, color: 'var(--c-accent)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
        }}>
          {q.question_type === 'mcq' ? 'Multiple Choice'
            : q.question_type === 'true_false' ? 'True or False'
            : 'Fill in the Blank'}
        </div>

        {/* Question text — special handling for fill_blank to show inline input */}
        {q.question_type === 'fill_blank' ? (
          <h3 style={{
            fontSize: '1.125rem', fontWeight: 600, color: 'var(--c-text-primary)',
            lineHeight: 2.4, marginBottom: 'var(--space-xl)',
          }}>
            {(() => {
              // Split question text on blank placeholders
              const parts = q.question_text.split(/(_{3,}|\[BLANK\]|\.{3,}|…)/i);
              if (parts.length <= 1) {
                // No inline blank found — show text + separate input
                return (
                  <>
                    <span>{q.question_text}</span>
                    <br />
                    <span style={{
                      display: 'inline-block', marginTop: 8,
                      fontSize: '0.75rem', color: 'var(--c-text-tertiary)',
                      fontWeight: 400,
                    }}>↓ Type your answer below</span>
                  </>
                );
              }
              // Render inline input at blank position
              return parts.map((part, i) => {
                if (/^(_{3,}|\[BLANK\]|\.{3,}|…)$/i.test(part)) {
                  const isCorrect = showResult && fillAnswer.toLowerCase().trim() === q.correct_answer?.toLowerCase().trim();
                  return (
                    <input
                      key={i}
                      value={fillAnswer}
                      onChange={e => setFillAnswer(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && fillAnswer.trim()) handleAnswer(fillAnswer.trim()); }}
                      placeholder="••••••"
                      disabled={showResult}
                      autoFocus
                      style={{
                        display: 'inline-block',
                        width: Math.max(140, (q.correct_answer?.length || 8) * 15),
                        padding: '4px 12px', margin: '0 6px',
                        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                        borderBottom: `2.5px dashed ${showResult
                          ? (isCorrect ? 'var(--c-success)' : 'var(--c-error)')
                          : 'var(--c-accent)'}`,
                        background: showResult
                          ? (isCorrect ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)')
                          : 'rgba(99,102,241,0.06)',
                        borderRadius: '4px 4px 0 0',
                        fontSize: 'inherit', fontWeight: 700,
                        color: showResult
                          ? (isCorrect ? 'var(--c-success)' : 'var(--c-error)')
                          : 'var(--c-accent)',
                        outline: 'none',
                        textAlign: 'center', fontFamily: 'inherit',
                        transition: 'all 0.2s ease',
                      }}
                    />
                  );
                }
                return <span key={i}>{part}</span>;
              });
            })()}
          </h3>
        ) : (
          <h3 style={{
            fontSize: '1.125rem', fontWeight: 600, color: 'var(--c-text-primary)',
            lineHeight: 1.6, marginBottom: 'var(--space-xl)',
          }}>
            {q.question_text}
          </h3>
        )}

        {/* ── MCQ Options ── */}
        {q.question_type === 'mcq' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {shuffledOptions.map((opt, i) => {
              const isCorrect = opt === q.correct_answer;
              const isSelected = selectedAnswer === opt;
              let cls = 'quiz-option';
              if (showResult && isCorrect) cls += ' correct';
              else if (showResult && isSelected && !isCorrect) cls += ' incorrect';
              else if (isSelected) cls += ' selected';

              return (
                <div key={i} className={cls} onClick={() => handleAnswer(opt)}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    border: `2px solid ${showResult && isCorrect ? 'var(--c-success)' : showResult && isSelected ? 'var(--c-error)' : 'var(--c-border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: showResult && isCorrect ? 'var(--c-success)' : showResult && isSelected ? 'var(--c-error)' : 'transparent',
                    transition: 'all 0.2s ease',
                  }}>
                    {showResult && isCorrect && <Check size={14} color="white" strokeWidth={3} />}
                    {showResult && isSelected && !isCorrect && <X size={14} color="white" strokeWidth={3} />}
                    {!showResult && (
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-tertiary)' }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.9375rem', color: 'var(--c-text-primary)', lineHeight: 1.5 }}>{opt}</span>
                </div>
              );
            })}
          </div>
        )}

        {q.question_type === 'true_false' && (
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            {shuffledOptions.map(opt => {
              const isTrueOption = opt === 'True' || opt === 'Đúng';
              const isCorrect = opt === q.correct_answer;
              const isSelected = selectedAnswer === opt;
              let borderColor = 'var(--c-border)';
              let bg = 'var(--c-bg-card)';
              if (showResult && isCorrect) { borderColor = 'var(--c-success)'; bg = 'var(--c-success-glow)'; }
              else if (showResult && isSelected && !isCorrect) { borderColor = 'var(--c-error)'; bg = 'var(--c-error-glow)'; }
              else if (isSelected) { borderColor = 'var(--c-accent)'; bg = 'var(--c-accent-glow)'; }

              return (
                <button
                  key={opt}
                  onClick={() => handleAnswer(opt)}
                  disabled={showResult}
                  style={{
                    flex: 1, padding: 'var(--space-xl)', borderRadius: 'var(--radius-lg)',
                    border: `2px solid ${borderColor}`, background: bg,
                    cursor: showResult ? 'default' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-sm)',
                    transition: 'all 0.2s ease', fontFamily: 'var(--font-sans)',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: isTrueOption ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isTrueOption
                      ? <CheckCircle size={22} style={{ color: '#34d399' }} />
                      : <XCircle size={22} style={{ color: '#f87171' }} />}
                  </div>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Fill in the Blank ── */}
        {q.question_type === 'fill_blank' && (
          <div>
            {/* Fallback input for questions without inline blank pattern */}
            {!q.question_text.match(/_{3,}|\[BLANK\]|\.{3,}|…/i) && (
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                <input
                  className="input"
                  value={fillAnswer}
                  onChange={e => setFillAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  onKeyDown={e => { if (e.key === 'Enter' && fillAnswer.trim()) handleAnswer(fillAnswer.trim()); }}
                  disabled={showResult}
                  style={{
                    fontSize: '1rem', flex: 1,
                    borderColor: showResult
                      ? (fillAnswer.toLowerCase().trim() === q.correct_answer?.toLowerCase().trim() ? 'var(--c-success)' : 'var(--c-error)')
                      : undefined,
                  }}
                  autoFocus
                />
              </div>
            )}
            {/* Submit button */}
            {!showResult && fillAnswer.trim() && (
              <button className="btn btn-primary" onClick={() => handleAnswer(fillAnswer.trim())} style={{ gap: 6 }}>
                <ArrowRight size={16} /> Submit Answer
              </button>
            )}
            {/* Result display */}
            {showResult && (
              <div style={{
                marginTop: 'var(--space-md)', padding: 'var(--space-md)',
                borderRadius: 'var(--radius-md)',
                background: selectedAnswer && selectedAnswer.toLowerCase() === q.correct_answer.toLowerCase()
                  ? 'var(--c-success-glow)' : 'var(--c-error-glow)',
                border: `1px solid ${selectedAnswer && selectedAnswer.toLowerCase() === q.correct_answer.toLowerCase()
                  ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
              }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 2 }}>
                  Correct answer:
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--c-success)' }}>
                  {q.correct_answer}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Explanation ── */}
        {showResult && q.explanation && (
          <div className="animate-fade-in-up" style={{
            marginTop: 'var(--space-lg)', padding: 'var(--space-md)',
            background: 'rgba(99,102,241,0.06)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(99,102,241,0.12)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-accent)',
              marginBottom: 6,
            }}>
              <Lightbulb size={13} /> Explanation
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--c-text-secondary)', lineHeight: 1.6 }}>
              {q.explanation}
            </div>
          </div>
        )}

        {/* Time up indicator */}
        {showResult && selectedAnswer === null && (
          <div className="animate-fade-in" style={{
            marginTop: 'var(--space-lg)', padding: 'var(--space-md)',
            background: 'var(--c-warning-glow)', borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(251,191,36,0.2)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
            fontSize: '0.8125rem', color: '#b45309',
          }}>
            <Clock size={14} /> Time's up! The correct answer is: <strong>{q.correct_answer}</strong>
          </div>
        )}
      </div>

      {/* ── Next Button ── */}
      {showResult && (
        <div style={{ paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
          <button className="btn btn-primary" onClick={handleNext} style={{ width: '100%' }}>
            {currentIndex < questions.length - 1
              ? <><span>Next Question</span><ArrowRight size={16} /></>
              : <><Trophy size={16} /><span>See Results</span></>}
          </button>
        </div>
      )}
    </div>
  );
}

/** Fisher-Yates shuffle (immutable) */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
