import { useState, useEffect, useRef } from 'react';
import { Clock, Pause, Play } from 'lucide-react';

/**
 * QuizTimer — Đồng hồ đếm thời gian cho quiz
 * - Đếm ngược per-question (nếu có timeLimit)
 * - Đếm tổng thời gian quiz (elapsed)
 * - Hiệu ứng warning khi sắp hết giờ
 * - Pause/Resume
 */
export default function QuizTimer({ 
  timeLimit = 0, 
  isRunning = true, 
  onTimeUp,
  onTick,
  questionIndex = 0,
}) {
  const [elapsed, setElapsed] = useState(0);
  const [questionElapsed, setQuestionElapsed] = useState(0);
  const intervalRef = useRef(null);
  const lastQuestionRef = useRef(questionIndex);

  // Reset question timer khi chuyển câu
  useEffect(() => {
    if (questionIndex !== lastQuestionRef.current) {
      setQuestionElapsed(0);
      lastQuestionRef.current = questionIndex;
    }
  }, [questionIndex]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
        setQuestionElapsed(prev => {
          const next = prev + 1;
          if (timeLimit > 0 && next >= timeLimit && onTimeUp) {
            onTimeUp();
          }
          return next;
        });
        if (onTick) onTick();
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, timeLimit, onTimeUp, onTick]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const remaining = timeLimit > 0 ? Math.max(0, timeLimit - questionElapsed) : null;
  const isWarning = remaining !== null && remaining <= 10;
  const isCritical = remaining !== null && remaining <= 5;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
    }}>
      {/* Tổng thời gian */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: '0.75rem', color: 'var(--c-text-tertiary)',
        fontFamily: 'var(--font-mono)',
      }}>
        <Clock size={13} />
        <span>{formatTime(elapsed)}</span>
      </div>

      {/* Thời gian còn lại per question */}
      {remaining !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0.25rem 0.625rem',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.75rem', fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          background: isCritical ? 'var(--c-error-glow)' : isWarning ? 'var(--c-warning-glow)' : 'var(--c-bg-secondary)',
          color: isCritical ? 'var(--c-error)' : isWarning ? '#b45309' : 'var(--c-text-secondary)',
          border: `1px solid ${isCritical ? 'rgba(248,113,113,0.2)' : isWarning ? 'rgba(251,191,36,0.2)' : 'var(--c-border)'}`,
          transition: 'all 0.3s ease',
          animation: isCritical ? 'pulse-glow 1s ease-in-out infinite' : 'none',
        }}>
          {formatTime(remaining)}
        </div>
      )}
    </div>
  );
}

/**
 * Hook: useQuizTimer — quản lý thời gian quiz
 */
export function useQuizTimer() {
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef(null);

  const start = () => {
    startTimeRef.current = Date.now();
    setIsRunning(true);
  };

  const stop = () => {
    if (startTimeRef.current) {
      setTotalSeconds(Math.round((Date.now() - startTimeRef.current) / 1000));
    }
    setIsRunning(false);
  };

  const getElapsed = () => {
    if (!startTimeRef.current) return 0;
    return Math.round((Date.now() - startTimeRef.current) / 1000);
  };

  return { totalSeconds, isRunning, start, stop, getElapsed };
}
