import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send, Sparkles, AlertCircle, RotateCcw, BookOpen,
  Square, Copy, Check, Trash2, Clock, Shield, Tag,
} from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import { getAccessToken, _buildAuthHeaders } from '../../services/api';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';
import useSpeechSynthesis from '../../hooks/useSpeechSynthesis';
import { VoiceInputButton, TTSButton, VoiceLanguageSelector } from '../voice/VoiceControls';
import MarkdownRenderer from '../shared/MarkdownRenderer';

/**
 * StreamingChatBox v2 — SSE Streaming Chat + RAG + Grounding + Topics
 * 
 * Sử dụng fetch() + ReadableStream để stream SSE từ backend.
 * Hỗ trợ AbortController để cancel request.
 * Displays grounding score and topic tracking.
 * Chat history được lưu per-document trong sessionStorage.
 */

const HISTORY_KEY_PREFIX = 'neurovault_chat_';

function getStoredMessages(documentId) {
  try {
    const raw = localStorage.getItem(`${HISTORY_KEY_PREFIX}${documentId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function storeMessages(documentId, messages) {
  try {
    // Giữ tối đa 50 tin nhắn gần nhất
    const trimmed = messages.slice(-50);
    localStorage.setItem(
      `${HISTORY_KEY_PREFIX}${documentId}`,
      JSON.stringify(trimmed)
    );
  } catch { /* quota exceeded — silent fail */ }
}

export default function StreamingChatBox({ documentId, documentTitle }) {
  const { user } = useAuthStore();

  // ── State ──
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('unknown'); // unknown | online | offline
  const [copiedId, setCopiedId] = useState(null);
  const [voiceLang, setVoiceLang] = useState('vi-VN');

  // ── Voice hooks ──
  const stt = useSpeechRecognition({
    language: voiceLang,
    onResult: (text) => setInputText(prev => prev + text),
  });
  const tts = useSpeechSynthesis();

  // ── Refs ──
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const streamBufferRef = useRef('');

  // ── Messages with history persistence ──
  const welcomeMessage = useMemo(() => ({
    id: 'welcome',
    role: 'ai',
    content: `Xin chào! Tôi là NeuroVault AI — trợ lý học tập thông minh.\n\nTôi đã phân tích tài liệu "${documentTitle || 'này'}". Hãy hỏi tôi bất cứ điều gì về nội dung tài liệu!`,
    timestamp: Date.now(),
  }), [documentTitle]);

  const [messages, setMessages] = useState(() => {
    const stored = getStoredMessages(documentId);
    return stored || [welcomeMessage];
  });

  // Persist messages khi thay đổi
  useEffect(() => {
    if (messages.length > 1) {
      storeMessages(documentId, messages);
    }
  }, [messages, documentId]);

  // Reset khi đổi document
  useEffect(() => {
    const stored = getStoredMessages(documentId);
    setMessages(stored || [{
      ...welcomeMessage,
      content: `Xin chào! Tôi là NeuroVault AI — trợ lý học tập thông minh.\n\nTôi đã phân tích tài liệu "${documentTitle || 'này'}". Hãy hỏi tôi bất cứ điều gì về nội dung tài liệu!`,
    }]);
    setConnectionStatus('unknown');
  }, [documentId, documentTitle, welcomeMessage]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ── Build chat history for API ──
  const buildChatHistory = useCallback(() => {
    return messages
      .filter(m => m.id !== 'welcome' && !m.isError)
      .slice(-10)
      .map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }));
  }, [messages]);

  // ── STREAMING SEND ──
  const handleSend = async () => {
    if (!inputText.trim() || isStreaming) return;

    const query = inputText.trim();
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsStreaming(true);
    streamBufferRef.current = '';

    // Tạo placeholder cho AI response
    const aiMsgId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: aiMsgId,
      role: 'ai',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }]);

    // AbortController cho cancel
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const chatHistory = buildChatHistory();

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: _buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          document_id: documentId,
          query,
          chat_history: chatHistory,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('text/event-stream')) {
        // ── SSE Stream Mode ──
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Giữ lại dòng chưa hoàn chỉnh

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (parsed.token || parsed.text || parsed.content) {
                  streamBufferRef.current += parsed.token || parsed.text || parsed.content || '';
                  setMessages(prev => prev.map(m =>
                    m.id === aiMsgId
                      ? { ...m, content: streamBufferRef.current }
                      : m
                  ));
                }
                // Cập nhật sources nếu có
                if (parsed.sources) {
                  setMessages(prev => prev.map(m =>
                    m.id === aiMsgId
                      ? { ...m, sources: parsed.sources }
                      : m
                  ));
                }
              } catch (e) {
                // Nếu parse JSON thất bại, có thể là plain text token
                if (data && data !== '[DONE]' && !data.startsWith('{')) {
                  streamBufferRef.current += data;
                  setMessages(prev => prev.map(m =>
                    m.id === aiMsgId
                      ? { ...m, content: streamBufferRef.current }
                      : m
                  ));
                }
              }
            }
          }
        }

        setConnectionStatus('online');
      } else {
        // ── JSON fallback (non-streaming response) ──
        const data = await response.json();
        const content = data.answer || data.response || 'Không có phản hồi từ AI.';
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId
            ? {
                ...m,
                content,
                sources: data.sources || [],
                grounding: data.grounding || null,
                topic: data.topic || null,
                isStreaming: false,
              }
            : m
        ));
        setConnectionStatus('online');
      }

      // Finalize: đánh dấu hết streaming
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, isStreaming: false } : m
      ));

    } catch (error) {
      if (error.name === 'AbortError') {
        // User cancelled — giữ partial content
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId
            ? { ...m, isStreaming: false, isCancelled: true }
            : m
        ));
      } else {
        console.error('[StreamingChat] Error:', error);
        setConnectionStatus('offline');

        let errorContent;
        if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed')) {
          errorContent = '⚠️ Không thể kết nối đến AI Engine.\n\nĐảm bảo cả 3 server đang chạy:\n• Backend (port 5001)\n• AI Core (port 8000)\n• Ollama (port 11434)';
        } else if (error.message?.includes('404')) {
          errorContent = '📄 Tài liệu chưa được xử lý bởi AI Engine.\n\nVui lòng đợi quá trình processing hoàn tất.';
        } else if (error.message?.includes('429')) {
          errorContent = '⏳ Quá nhiều yêu cầu. Vui lòng đợi một chút rồi thử lại.';
        } else {
          errorContent = `❌ Lỗi: ${error.message || 'Không thể xử lý yêu cầu'}\n\nVui lòng thử lại.`;
        }

        setMessages(prev => prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: errorContent, isStreaming: false, isError: true }
            : m
        ));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  // ── Stop streaming ──
  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  // ── Retry last message ──
  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // Xóa error message cuối
      setMessages(prev => prev.filter(m => !m.isError));
      setInputText(lastUserMsg.content);
    }
  };

  // ── Copy message ──
  const handleCopy = async (msgId, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* fallback for non-HTTPS */ }
  };

  // ── Clear history ──
  const handleClearHistory = () => {
    sessionStorage.removeItem(`${HISTORY_KEY_PREFIX}${documentId}`);
    setMessages([welcomeMessage]);
  };

  const lastMessage = messages[messages.length - 1];
  const hasError = lastMessage?.isError;
  const messageCount = messages.filter(m => m.id !== 'welcome').length;

  return (
    <div className="ai-studio-chat" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: 'var(--c-bg-card)',
      border: '1px solid var(--c-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      {/* ── Header Bar ── */}
      <div style={{
        padding: '0.625rem 1rem',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--c-bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connectionStatus === 'online' ? 'var(--c-success)'
              : connectionStatus === 'offline' ? 'var(--c-error)'
              : 'var(--c-text-muted)',
            boxShadow: connectionStatus === 'online' ? '0 0 6px var(--c-success)' : 'none',
          }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-text-secondary)' }}>
            NeuroVault AI {connectionStatus === 'online' ? '— Online' : connectionStatus === 'offline' ? '— Offline' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {messageCount > 0 && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', marginRight: 4 }}>
              {messageCount} messages
            </span>
          )}
          <button
            onClick={handleClearHistory}
            title="Xóa lịch sử chat"
            style={{
              width: 28, height: 28, borderRadius: 'var(--radius-sm)',
              border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--c-text-tertiary)',
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg-tertiary)'; e.currentTarget.style.color = 'var(--c-text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text-tertiary)'; }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Messages Area ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: 'var(--space-lg)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-md)',
      }}>
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={i > 0 ? 'animate-fade-in-up' : ''}
            style={{
              display: 'flex', gap: 'var(--space-sm)',
              alignItems: 'flex-start',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 30, height: 30,
              borderRadius: msg.role === 'ai' ? 'var(--radius-sm)' : '50%',
              background: msg.role === 'ai'
                ? (msg.isError ? 'var(--c-warning-glow)' : 'var(--c-accent-gradient)')
                : 'var(--c-bg-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              border: msg.role === 'user' ? '1px solid var(--c-border)' : 'none',
              boxShadow: msg.role === 'ai' && !msg.isError ? '0 2px 8px rgba(99,102,241,0.2)' : 'none',
            }}>
              {msg.role === 'ai'
                ? (msg.isError
                  ? <AlertCircle size={13} color="#b45309" strokeWidth={2} />
                  : <Sparkles size={13} color="white" strokeWidth={2} />)
                : <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-secondary)' }}>
                    {user?.name?.charAt(0) || 'U'}
                  </span>
              }
            </div>

            {/* Message Content */}
            <div style={{ maxWidth: '78%', position: 'relative' }}>
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: msg.role === 'user'
                  ? 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)'
                  : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
                background: msg.isError
                  ? 'var(--c-warning-glow)'
                  : (msg.role === 'user' ? 'var(--c-accent-glow)' : 'var(--c-bg-secondary)'),
                border: `1px solid ${msg.isError
                  ? 'rgba(245, 158, 11, 0.15)'
                  : (msg.role === 'user' ? 'rgba(99,102,241,0.15)' : 'var(--c-border)')}`,
              }}>
                <div style={{
                  fontSize: '0.8125rem', lineHeight: 1.7,
                  color: msg.isError ? 'var(--c-text-secondary)' : 'var(--c-text-primary)',
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'ai' && !msg.isError
                    ? <MarkdownRenderer content={msg.content} />
                    : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  }
                  {msg.isStreaming && (
                    <span className="streaming-cursor" style={{
                      display: 'inline-block',
                      width: 2, height: '1em',
                      background: 'var(--c-accent)',
                      marginLeft: 2,
                      animation: 'blink-cursor 0.8s step-end infinite',
                      verticalAlign: 'text-bottom',
                    }} />
                  )}
                </div>

                {/* Source Citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: 'var(--space-sm)', paddingTop: 'var(--space-xs)', borderTop: '1px solid var(--c-border)' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      marginBottom: 4, fontSize: '0.625rem',
                      color: 'var(--c-text-tertiary)', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      <BookOpen size={9} /> Nguồn tham chiếu
                    </div>
                    {msg.sources.slice(0, 3).map((src, si) => (
                      <div key={si} style={{
                        fontSize: '0.6875rem', color: 'var(--c-text-tertiary)',
                        padding: '0.25rem 0.4rem', marginBottom: 2,
                        borderRadius: 'var(--radius-sm)', background: 'var(--c-bg-primary)',
                        lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        <span style={{ color: 'var(--c-accent)', fontWeight: 500 }}>
                          [{src.chunk_id?.slice(0, 8) || `P${si + 1}`}]
                        </span>{' '}
                        {src.text?.slice(0, 120) || 'No preview'}...
                      </div>
                    ))}
                  </div>
                )}

                {/* Grounding Score Badge (Phase 3 — Task 3.4) */}
                {msg.grounding && !msg.isStreaming && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 'var(--space-xs)', paddingTop: 'var(--space-xs)',
                    borderTop: '1px solid var(--c-border)',
                  }}>
                    <Shield size={10} style={{
                      color: msg.grounding.is_grounded ? '#34d399' : '#fbbf24',
                    }} />
                    <span style={{
                      fontSize: '0.5625rem', fontWeight: 600,
                      color: msg.grounding.is_grounded ? '#34d399' : '#fbbf24',
                    }}>
                      {msg.grounding.is_grounded ? 'Grounded' : 'Unverified'}
                    </span>
                    <span style={{
                      fontSize: '0.5625rem', color: 'var(--c-text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {Math.round(msg.grounding.grounding_score * 100)}%
                    </span>
                    {msg.topic && msg.topic.current_topic && (
                      <>
                        <span style={{ color: 'var(--c-border)', margin: '0 2px' }}>·</span>
                        <Tag size={9} style={{ color: 'var(--c-text-muted)' }} />
                        <span style={{
                          fontSize: '0.5625rem', color: 'var(--c-text-muted)',
                        }}>
                          {msg.topic.current_topic}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Message actions (copy) — chỉ hiện cho AI messages khi không streaming */}
                {msg.role === 'ai' && !msg.isStreaming && msg.id !== 'welcome' && !msg.isError && (
                <div style={{
                  display: 'flex', gap: 2, marginTop: 4,
                }}>
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    style={{
                      width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--c-text-muted)',
                      transition: 'all var(--duration-fast)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text-secondary)'; e.currentTarget.style.background = 'var(--c-bg-tertiary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                    title="Copy"
                  >
                    {copiedId === msg.id ? <Check size={11} color="var(--c-success)" /> : <Copy size={11} />}
                  </button>
                  <TTSButton
                    isSpeaking={tts.isSpeaking}
                    isSupported={tts.isSupported}
                    onClick={() => tts.isSpeaking ? tts.stop() : tts.speak(msg.content, { language: voiceLang })}
                  />
                </div>
              )}

              {/* Cancelled indicator */}
              {msg.isCancelled && (
                <div style={{ fontSize: '0.6875rem', color: 'var(--c-text-tertiary)', marginTop: 4, fontStyle: 'italic' }}>
                  ⏹ Đã dừng tạo phản hồi
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ── */}
      <div style={{
        padding: 'var(--space-sm) var(--space-md)',
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-bg-card)',
      }}>
        {hasError && (
          <button onClick={handleRetry} className="btn btn-ghost btn-sm" style={{
            marginBottom: 'var(--space-xs)', width: '100%',
            justifyContent: 'center', gap: 6,
          }}>
            <RotateCcw size={12} /> Thử lại câu hỏi trước
          </button>
        )}

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Voice language selector */}
          {stt.isSupported && <VoiceLanguageSelector language={voiceLang} onChange={setVoiceLang} />}

          {/* Voice input button */}
          <VoiceInputButton
            isListening={stt.isListening}
            isSupported={stt.isSupported}
            onClick={() => stt.toggleListening({ language: voiceLang })}
            error={stt.error}
          />

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={stt.isListening ? 'Đang nghe...' : 'Hỏi về tài liệu này...'}
            disabled={isStreaming}
            className="input"
            style={{
              flex: 1, borderRadius: 'var(--radius-full)',
              paddingRight: '3rem', background: 'var(--c-bg-secondary)',
              opacity: isStreaming ? 0.6 : 1,
              fontSize: '0.8125rem',
              borderColor: stt.isListening ? 'rgba(239,68,68,0.3)' : undefined,
            }}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              title="Dừng tạo phản hồi"
              style={{
                position: 'absolute', right: 6, width: 32, height: 32,
                borderRadius: 'var(--radius-full)',
                background: 'var(--c-error-glow)',
                border: '1px solid rgba(248,113,113,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all var(--duration-fast)',
              }}
            >
              <Square size={12} color="var(--c-error)" fill="var(--c-error)" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              style={{
                position: 'absolute', right: 6, width: 32, height: 32,
                borderRadius: 'var(--radius-full)',
                background: inputText.trim() ? 'var(--c-accent-gradient)' : 'var(--c-bg-tertiary)',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: inputText.trim() ? 'pointer' : 'default',
                transition: 'all var(--duration-fast)',
              }}
            >
              <Send size={13} color={inputText.trim() ? 'white' : 'var(--c-text-muted)'} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
