import { useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Settings } from 'lucide-react';

/**
 * VoiceInputButton — Compact mic toggle button with pulse animation.
 * Props: isListening, isSupported, onClick, error
 */
export function VoiceInputButton({ isListening, isSupported, onClick, error, size = 'md' }) {
  if (!isSupported) return null;

  const sizes = { sm: 28, md: 32, lg: 40 };
  const iconSizes = { sm: 12, md: 14, lg: 18 };
  const s = sizes[size] || sizes.md;
  const is = iconSizes[size] || iconSizes.md;

  return (
    <button
      onClick={onClick}
      title={isListening ? 'Stop recording' : error || 'Voice input'}
      style={{
        width: s, height: s, borderRadius: 'var(--radius-full)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isListening ? 'rgba(239,68,68,0.15)' : 'transparent',
        color: isListening ? '#ef4444' : 'var(--c-text-tertiary)',
        transition: 'all 0.2s', position: 'relative',
      }}
    >
      {isListening && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid #ef4444', animation: 'voice-pulse 1.5s ease-in-out infinite',
        }} />
      )}
      {isListening ? <MicOff size={is} /> : <Mic size={is} />}
    </button>
  );
}

/**
 * TTSButton — Read aloud toggle button.
 * Props: isSpeaking, isSupported, onClick
 */
export function TTSButton({ isSpeaking, isSupported, onClick, size = 'sm' }) {
  if (!isSupported) return null;

  const sizes = { sm: 24, md: 28, lg: 32 };
  const iconSizes = { sm: 11, md: 13, lg: 16 };
  const s = sizes[size] || sizes.sm;
  const is = iconSizes[size] || iconSizes.sm;

  return (
    <button
      onClick={onClick}
      title={isSpeaking ? 'Stop reading' : 'Read aloud'}
      style={{
        width: s, height: s, borderRadius: 'var(--radius-sm)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isSpeaking ? 'rgba(99,102,241,0.1)' : 'transparent',
        color: isSpeaking ? 'var(--c-accent)' : 'var(--c-text-muted)',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => { if (!isSpeaking) e.currentTarget.style.color = 'var(--c-text-secondary)'; e.currentTarget.style.background = 'var(--c-bg-tertiary)'; }}
      onMouseLeave={e => { if (!isSpeaking) { e.currentTarget.style.color = 'var(--c-text-muted)'; e.currentTarget.style.background = 'transparent'; } }}
    >
      {isSpeaking ? <VolumeX size={is} /> : <Volume2 size={is} />}
    </button>
  );
}

/**
 * VoiceLanguageSelector — Small language toggle (vi/en).
 */
export function VoiceLanguageSelector({ language, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--c-bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
      {[{ code: 'vi-VN', label: 'VI' }, { code: 'en-US', label: 'EN' }].map(lang => (
        <button key={lang.code} onClick={() => onChange(lang.code)} style={{
          padding: '2px 8px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.03em',
          background: language === lang.code ? 'var(--c-bg-card)' : 'transparent',
          color: language === lang.code ? 'var(--c-text-primary)' : 'var(--c-text-muted)',
        }}>{lang.label}</button>
      ))}
    </div>
  );
}
