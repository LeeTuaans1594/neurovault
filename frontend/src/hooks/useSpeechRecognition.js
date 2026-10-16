import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useSpeechRecognition — Web Speech API hook for Speech-to-Text.
 *
 * Features:
 * - Continuous/single-shot modes
 * - Auto language detection (vi/en)
 * - Interim results for real-time feedback
 * - Error handling with user-friendly messages
 *
 * Browser support: Chrome, Edge, Safari 14.1+
 */
export default function useSpeechRecognition({ language = 'vi-VN', continuous = false, onResult, onInterim } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const startListening = useCallback((opts = {}) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* */ }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = opts.language || language;
    recognition.continuous = opts.continuous ?? continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      if (final) {
        setTranscript(prev => prev + final);
        onResult?.(final);
      }
      if (interim) {
        onInterim?.(interim);
      }
    };

    recognition.onerror = (event) => {
      const errorMap = {
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'Microphone not found. Check permissions.',
        'not-allowed': 'Microphone access denied. Please allow in browser settings.',
        'network': 'Network error. Check your connection.',
        'aborted': null, // User aborted — not an error
      };
      const msg = errorMap[event.error] ?? `Speech error: ${event.error}`;
      if (msg) setError(msg);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [language, continuous, onResult, onInterim]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback((opts) => {
    if (isListening) stopListening();
    else startListening(opts);
  }, [isListening, startListening, stopListening]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* */ }
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    error,
    transcript,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript: () => setTranscript(''),
  };
}
