import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Brain, MessageSquare, HelpCircle, Layers, Network,
  FileText, Sparkles, BookOpen, BookMarked,
  ChevronRight, Zap, Loader2, AlertCircle,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { documentsAPI, aiAPI } from '../services/api';
import useI18nStore from '../store/useI18nStore';
import StreamingChatBox from '../components/chat/StreamingChatBox';
import QuizView from '../components/quiz/QuizView';
import FlashcardView from '../components/flashcard/FlashcardView';
import KnowledgeGraphView from '../components/knowledge/KnowledgeGraphView';
import SummaryView from '../components/summary/SummaryView';

/**
 * AI Studio v2 — Tab-based AI Learning Interface
 * 
 * Tính năng:
 * - 5 tabs: Chat, Quiz, Flashcards, Knowledge Graph, Summary
 * - Streaming chat (SSE) với AbortController
 * - Document selector sidebar (collapsible)
 * - Chat history persistence (sessionStorage)
 * - AI Core status indicator
 * - Keyboard shortcuts
 */

const AI_TABS = [
  {
    id: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.08)',
    borderColor: 'rgba(99, 102, 241, 0.15)',
    desc: 'RAG-powered Q&A',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: HelpCircle,
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.15)',
    desc: "Bloom's Taxonomy assessments",
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    icon: Layers,
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.15)',
    desc: 'FSRS spaced repetition',
  },
  {
    id: 'knowledge-graph',
    label: 'Graph',
    icon: Network,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.15)',
    desc: 'Force-directed concepts',
  },
  {
    id: 'summary',
    label: 'Summary',
    icon: BookMarked,
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.15)',
    desc: 'TextRank + Gemma 4',
  },
];

export default function AIStudioPage() {
  const navigate = useNavigate();
  const t = useI18nStore(s => s.t);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── State ──
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiStatus, setAiStatus] = useState(null); // { ai_core, ollama, gemma4_ready }
  const [searchQuery, setSearchQuery] = useState('');

  // ── Load documents ──
  useEffect(() => {
    loadDocuments();
    checkAIStatus();
  }, []);

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      const data = await documentsAPI.list(1, 100);
      const completed = (data.documents || []).filter(
        d => d.metadata?.processing_status === 'completed'
      );
      setDocuments(completed);
      // Auto-select first document hoặc document từ URL param
      const docParam = searchParams.get('doc');
      if (docParam) {
        const found = completed.find(d => d._id === docParam);
        if (found) setSelectedDoc(found);
        else if (completed.length > 0) setSelectedDoc(completed[0]);
      } else if (completed.length > 0 && !selectedDoc) {
        setSelectedDoc(completed[0]);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách tài liệu:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkAIStatus = async () => {
    try {
      const status = await aiAPI.getStats();
      setAiStatus(status);
    } catch {
      setAiStatus({ llm_available: false });
    }
  };

  // ── Update URL khi đổi tab ──
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', activeTab);
    if (selectedDoc) params.set('doc', selectedDoc._id);
    setSearchParams(params, { replace: true });
  }, [activeTab, selectedDoc]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl + 1-5: Chuyển tab
      if (e.ctrlKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (AI_TABS[idx]) setActiveTab(AI_TABS[idx].id);
      }
      // Ctrl + B: Toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Filtered documents ──
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(d => d.title?.toLowerCase().includes(q));
  }, [documents, searchQuery]);

  // ── Active tab config ──
  const activeTabConfig = AI_TABS.find(t => t.id === activeTab);

  // ── Render tab content ──
  // Render ALL tabs simultaneously, hide inactive with display:none
  // This preserves component state (chat history, quiz progress, etc.) across tab switches
  const renderContent = () => {
    if (!selectedDoc) {
      return (
        <div className="empty-state" style={{ height: '100%' }}>
          <div className="empty-state-icon">
            <BookOpen size={32} style={{ color: 'var(--c-accent)' }} strokeWidth={1.5} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 6 }}>
              {t('aiStudio.selectDoc')}
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--c-text-secondary)', maxWidth: 320 }}>
              {t('aiStudio.selectDocDesc')}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/documents')}>
            <FileText size={16} /> {t('aiStudio.manageDocs')}
          </button>
        </div>
      );
    }

    return (
      <>
        <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <StreamingChatBox documentId={selectedDoc._id} documentTitle={selectedDoc.title} />
        </div>
        <div style={{ display: activeTab === 'quiz' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <QuizView documentId={selectedDoc._id} />
        </div>
        <div style={{ display: activeTab === 'flashcards' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <FlashcardView documentId={selectedDoc._id} />
        </div>
        <div style={{ display: activeTab === 'knowledge-graph' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <KnowledgeGraphView documentId={selectedDoc._id} />
        </div>
        <div style={{ display: activeTab === 'summary' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <SummaryView documentId={selectedDoc._id} />
        </div>
      </>
    );
  };

  return (
    <div className="animate-fade-in-up ai-studio-page" style={{
      height: 'calc(100vh - var(--header-height) - var(--space-xl) * 2)',
      display: 'flex', flexDirection: 'column',
      maxWidth: 1600, margin: '0 auto',
    }}>
      {/* ══════ Header ══════ */}
      <div style={{ marginBottom: 'var(--space-md)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 2 }}>
              <Sparkles size={16} style={{ color: 'var(--c-accent)' }} />
              <span style={{
                fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-accent)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                AI Studio
              </span>
            </div>
            <h1 style={{
              fontSize: '1.5rem', fontWeight: 700, color: 'var(--c-text-primary)',
              letterSpacing: '-0.03em',
            }}>
              {t('aiStudio.title')}
            </h1>
          </div>

          {/* AI Status Indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
          }}>
            {aiStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.375rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                background: aiStatus.llm_available ? 'var(--c-success-glow)' : 'var(--c-warning-glow)',
                border: `1px solid ${aiStatus.llm_available ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)'}`,
                fontSize: '0.6875rem', fontWeight: 500,
                color: aiStatus.llm_available ? 'var(--c-success)' : '#b45309',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: aiStatus.llm_available ? 'var(--c-success)' : '#b45309',
                  boxShadow: aiStatus.llm_available ? '0 0 6px var(--c-success)' : 'none',
                }} />
                {aiStatus.llm_available ? t('aiStudio.aiOnline') : t('aiStudio.aiOffline')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════ Main Content ══════ */}
      <div style={{
        flex: 1, display: 'flex', gap: 'var(--space-md)',
        minHeight: 0, // Quan trọng: cho phép flex item co lại
      }}>
        {/* ──── Left: Document Sidebar ──── */}
        <div
          className="ai-studio-sidebar"
          style={{
            width: sidebarOpen ? 260 : 0,
            overflow: 'hidden',
            flexShrink: 0,
            transition: 'width var(--duration-normal) var(--ease-out-expo)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{
            width: 260, // Cố định chiều rộng nội dung
            display: 'flex', flexDirection: 'column',
            height: '100%',
          }}>
            {/* Sidebar header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 'var(--space-sm)',
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--c-text-secondary)' }}>
                {t('aiStudio.docCount', { count: documents.length })}
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--c-text-tertiary)',
                }}
                title="Thu gọn sidebar (Ctrl+B)"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('aiStudio.searchDocs')}
              className="input"
              style={{
                fontSize: '0.75rem', padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-sm)',
              }}
            />

            {/* Document list */}
            <div style={{
              flex: 1, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {isLoading ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-md)' }} />
                ))
              ) : filteredDocs.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 'var(--space-xl)',
                  color: 'var(--c-text-tertiary)', fontSize: '0.8125rem',
                }}>
                  {documents.length === 0
                    ? t('documents.noDocuments')
                    : t('common.noResults')}
                </div>
              ) : (
                filteredDocs.map(doc => {
                  const isSelected = selectedDoc?._id === doc._id;
                  return (
                    <button
                      key={doc._id}
                      onClick={() => setSelectedDoc(doc)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                        padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)',
                        border: isSelected ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                        background: isSelected ? 'var(--c-accent-glow)' : 'transparent',
                        cursor: 'pointer', width: '100%', textAlign: 'left',
                        transition: 'all var(--duration-fast)',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--c-bg-secondary)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                        background: isSelected ? 'rgba(99,102,241,0.15)' : 'var(--c-bg-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <FileText size={13} style={{
                          color: isSelected ? 'var(--c-accent)' : 'var(--c-text-tertiary)',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.75rem', fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? 'var(--c-accent)' : 'var(--c-text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {doc.title}
                        </div>
                        <div style={{ fontSize: '0.625rem', color: 'var(--c-text-tertiary)' }}>
                          {doc.metadata?.word_count?.toLocaleString() || 0} words
                          {doc.language ? ` · ${doc.language.toUpperCase()}` : ''}
                        </div>
                      </div>
                      {isSelected && <ChevronRight size={12} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Upload button */}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/documents')}
              style={{ marginTop: 'var(--space-sm)', width: '100%', justifyContent: 'center', gap: 6 }}
            >
              <FileText size={13} /> {t('aiStudio.manageDocs')}
            </button>
          </div>
        </div>

        {/* ──── Right: Tab Content Area ──── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minWidth: 0, // Quan trọng: cho phép co lại
        }}>
          {/* Tab Bar */}
          <div style={{
            display: 'flex', alignItems: 'center',
            borderBottom: '1px solid var(--c-border)',
            marginBottom: 'var(--space-md)',
            flexShrink: 0,
          }}>
            {/* Sidebar toggle (khi closed) */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--c-border)', background: 'var(--c-bg-card)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 'var(--space-md)', flexShrink: 0,
                  color: 'var(--c-text-tertiary)',
                  transition: 'all var(--duration-fast)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border-hover)'; e.currentTarget.style.color = 'var(--c-text-secondary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-tertiary)'; }}
                title="Mở sidebar (Ctrl+B)"
              >
                <PanelLeftOpen size={14} />
              </button>
            )}

            {/* Tabs */}
            <div className="tab-bar" style={{
              flex: 1, borderBottom: 'none', gap: 0,
              overflowX: 'auto',
            }}>
              {AI_TABS.map((tab, i) => {
                const isActive = activeTab === tab.id;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={`tab-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      borderBottomWidth: 2,
                      borderBottomColor: isActive ? tab.color : 'transparent',
                      color: isActive ? tab.color : undefined,
                      gap: 6,
                    }}
                    title={`${tab.label} — ${tab.desc} (Ctrl+${i + 1})`}
                  >
                    <TabIcon size={14} style={{ color: isActive ? tab.color : 'var(--c-text-tertiary)' }} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected document badge */}
            {selectedDoc && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.25rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--c-bg-secondary)',
                border: '1px solid var(--c-border)',
                marginLeft: 'var(--space-sm)',
                maxWidth: 200,
                flexShrink: 0,
              }}>
                <FileText size={11} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                <span style={{
                  fontSize: '0.6875rem', color: 'var(--c-text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: 500,
                }}>
                  {selectedDoc.title}
                </span>
              </div>
            )}
          </div>

          {/* Tab Content */}
          <div style={{
            flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column',
          }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
