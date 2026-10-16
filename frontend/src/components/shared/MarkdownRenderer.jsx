import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './markdown.css';

/**
 * MarkdownRenderer — Shared Markdown → HTML renderer
 * 
 * Features:
 * - Parse markdown (headings, bold, lists, code blocks, tables, etc.)
 * - Strip <think>...</think> blocks from Qwen3/Gemma4 models
 * - Dark theme styling via markdown.css
 * - Reusable: Chat, Summary, Flashcards
 * 
 * Note: react-markdown v9+ removed `className` prop.
 * We wrap in a div with className instead.
 */

// Strip LLM thinking blocks that may leak into output
function stripThinkingBlocks(text) {
  if (!text) return '';
  return text
    // Complete thinking blocks
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|think\|>[\s\S]*?<\|\/think\|>/gi, '')
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '')
    // Incomplete thinking blocks at the end (streaming)
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/<\|think\|>[\s\S]*$/i, '')
    .trim();
}

export default function MarkdownRenderer({ content, className }) {
  const cleaned = stripThinkingBlocks(content || '');

  if (!cleaned) return null;

  // react-markdown v9+ removed className prop — use wrapper div instead
  return (
    <div className={`md-content ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open links in new tab
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}

export { stripThinkingBlocks };
