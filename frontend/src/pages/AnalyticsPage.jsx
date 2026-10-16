import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Brain, Clock, Target, Zap, Activity, Calendar } from 'lucide-react';
import { analyticsAPI } from '../services/api';
import useI18nStore from '../store/useI18nStore';

// Sub-components
import StudyTrendChart from '../components/analytics/StudyTrendChart';
import QuizTrendChart from '../components/analytics/QuizTrendChart';
import SessionDistribution from '../components/analytics/SessionDistribution';
import ConceptMasteryTable from '../components/analytics/ConceptMasteryTable';
import StudyPatterns from '../components/analytics/StudyPatterns';
import PredictionCard from '../components/analytics/PredictionCard';

const RANGE_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

export default function AnalyticsPage() {
  const t = useI18nStore(s => s.t);
  const [data, setData] = useState(null);
  const [range, setRange] = useState(30);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadData(); }, [range]);

  const loadData = async () => {
    setIsLoading(true);
    const result = await analyticsAPI.getOverview(range);
    setData(result);
    setIsLoading(false);
  };

  const s = data?.summaryStats || {};

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--c-text-primary)', marginBottom: 4 }}>
            <span className="text-gradient">{t('analytics.title')}</span>
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)' }}>
            {t('analytics.subtitle')}
          </p>
        </div>
        {/* Range Selector */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--c-bg-secondary)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          {RANGE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setRange(opt.value)} style={{
              padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s',
              background: range === opt.value ? 'var(--c-accent-gradient)' : 'transparent',
              color: range === opt.value ? '#fff' : 'var(--c-text-tertiary)',
            }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)' }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            {[
              { icon: Clock, label: 'Study Time', value: `${s.totalHours || 0}h`, sub: `${s.avgSessionMinutes || 0} min/session`, color: '#6366f1' },
              { icon: Calendar, label: 'Active Days', value: `${s.activeDays || 0}/${s.totalDays || 0}`, sub: `${Math.round((s.activeDays||0)/(s.totalDays||1)*100)}% consistency`, color: '#10b981' },
              { icon: Target, label: 'Quiz Score', value: `${s.avgQuizScore || 0}%`, sub: `${s.totalQuizzes || 0} quizzes`, color: '#f59e0b' },
              { icon: Zap, label: 'Flashcards', value: s.totalFlashcardsReviewed || 0, sub: `reviewed in ${range}d`, color: '#8b5cf6' },
            ].map((card, i) => (
              <div key={card.label} className={`bento-card animate-fade-in-up stagger-${i+1}`} style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: `${card.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <card.icon size={16} style={{ color: card.color }} />
                  </div>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--c-text-primary)', letterSpacing: '-0.02em' }}>{card.value}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', marginTop: 2 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Row 2: Study Trend + Quiz Trend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div className="animate-fade-in-up stagger-2"><StudyTrendChart data={data?.studyTimeTrend || []} /></div>
            <div className="animate-fade-in-up stagger-3"><QuizTrendChart quizData={data?.quizPerformance || []} weeklyTrend={data?.quizWeeklyTrend || []} /></div>
          </div>

          {/* Row 3: Distribution + Patterns + Prediction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div className="animate-fade-in-up stagger-3"><SessionDistribution typeData={data?.typeDistribution} timeData={data?.timeDistribution} /></div>
            <div className="animate-fade-in-up stagger-4"><StudyPatterns patterns={data?.studyPatterns} /></div>
            <div className="animate-fade-in-up stagger-5"><PredictionCard prediction={data?.prediction} conceptStats={data?.conceptStats} gamification={data?.gamification} /></div>
          </div>

          {/* Row 4: Concept Mastery */}
          <div className="animate-fade-in-up stagger-5">
            <ConceptMasteryTable strong={data?.strongConcepts || []} weak={data?.weakConcepts || []} stats={data?.conceptStats || {}} />
          </div>
        </>
      )}
    </div>
  );
}
