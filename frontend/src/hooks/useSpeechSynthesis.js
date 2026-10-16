import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useSpeechSynthesis — Web Speech API hook for Text-to-Speech.
 *
 * Features:
 * - Voice selection (system voices)
 * - Rate, pitch, volume controls
 * - Pause/resume
 * - Word highlight callback
 */
export default function useSpeechSynthesis({ defaultRate = 1, defaultPitch = 1, defaultVolume = 0.8 } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState([]);
  const [isSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);
  const utteranceRef = useRef(null);

  // Load voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [isSupported]);

  const speak = useCallback((text, opts = {}) => {
    if (!isSupported || !text) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = opts.rate ?? defaultRate;
    utterance.pitch = opts.pitch ?? defaultPitch;
    utterance.volume = opts.volume ?? defaultVolume;

    // Voice selection: prefer matching language
    if (opts.voice) {
      utterance.voice = opts.voice;
    } else {
      const lang = opts.language || 'en-US';
      const preferred = voices.find(v => v.lang.startsWith(lang.slice(0, 2)) && v.localService);
      if (preferred) utterance.voice = preferred;
      utterance.lang = lang;
    }

    utterance.onstart = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend = () => { setIsSpeaking(false); setIsPaused(false); utteranceRef.current = null; };
    utterance.onerror = () => { setIsSpeaking(false); setIsPaused(false); utteranceRef.current = null; };
    utterance.onpause = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);

    // Boundary callback for word highlighting
    if (opts.onBoundary) {
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          opts.onBoundary({
            charIndex: event.charIndex,
            charLength: event.charLength,
            word: text.slice(event.charIndex, event.charIndex + (event.charLength || 0)),
          });
        }
      };
    }

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported, voices, defaultRate, defaultPitch, defaultVolume]);

  const pause = useCallback(() => {
    if (isSupported) window.speechSynthesis.pause();
  }, [isSupported]);

  const resume = useCallback(() => {
    if (isSupported) window.speechSynthesis.resume();
  }, [isSupported]);

  const stop = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [isSupported]);

  // Get voices by language
  const getVoicesForLang = useCallback((langCode) => {
    return voices.filter(v => v.lang.startsWith(langCode));
  }, [voices]);

  // Cleanup
  useEffect(() => {
    return () => { if (isSupported) window.speechSynthesis.cancel(); };
  }, [isSupported]);

  return {
    speak, pause, resume, stop,
    isSpeaking, isPaused, isSupported,
    voices, getVoicesForLang,
  };
}
