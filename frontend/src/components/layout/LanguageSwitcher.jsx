import useI18nStore from '../../store/useI18nStore';

/**
 * LanguageSwitcher — Compact toggle between available locales.
 * Placed in header or settings.
 */
export default function LanguageSwitcher({ size = 'sm' }) {
  const { locale, setLocale, availableLocales } = useI18nStore();

  if (size === 'full') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        {availableLocales.map(l => (
          <button key={l.code} onClick={() => setLocale(l.code)} style={{
            padding: '6px 14px', borderRadius: 'var(--radius-md)', border: '1px solid',
            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
            background: locale === l.code ? 'var(--c-accent-glow)' : 'transparent',
            borderColor: locale === l.code ? 'rgba(99,102,241,0.3)' : 'var(--c-border)',
            color: locale === l.code ? 'var(--c-accent)' : 'var(--c-text-tertiary)',
            transition: 'all 0.2s',
          }}>
            <span>{l.flag}</span> {l.label}
          </button>
        ))}
      </div>
    );
  }

  // Compact toggle
  return (
    <div style={{
      display: 'flex', gap: 2, background: 'var(--c-bg-tertiary)',
      borderRadius: 'var(--radius-sm)', padding: 2,
    }}>
      {availableLocales.map(l => (
        <button key={l.code} onClick={() => setLocale(l.code)} title={l.label} style={{
          padding: '3px 8px', border: 'none', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', fontSize: '0.625rem', fontWeight: 700,
          background: locale === l.code ? 'var(--c-bg-card)' : 'transparent',
          color: locale === l.code ? 'var(--c-text-primary)' : 'var(--c-text-muted)',
          transition: 'all 0.15s', letterSpacing: '0.03em',
        }}>
          {l.flag}
        </button>
      ))}
    </div>
  );
}
