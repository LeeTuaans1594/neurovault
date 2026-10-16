import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Network, Loader2, RotateCcw, ZoomIn, ZoomOut, Maximize2,
  Search, Filter, Info, X, ChevronDown,
} from 'lucide-react';
import { aiAPI } from '../../services/api';
import ForceEngine from './ForceEngine';
import GraphRenderer, { getMasteryColor, NODE_PALETTE } from './GraphRenderer';

/**
 * KnowledgeGraphView v3 — Force-Directed Interactive Visualizer
 * - Barnes-Hut physics (O(n log n))
 * - High-DPI Canvas rendering
 * - Mastery color-coding (red→green)
 * - Community cluster coloring (Label Propagation)
 * - Particle animations on edges
 * - Minimap, search, filter, neighbor highlighting
 * - Edge arrows + relation labels
 * - LLM-verified relation badges
 */
export default function KnowledgeGraphView({ documentId }) {
  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const rendererRef = useRef(null);
  const animRef = useRef(null);

  const [graphData, setGraphData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [selectedNode, setSelectedNode] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // all, high-centrality, low-mastery
  const [edgeDensity, setEdgeDensity] = useState(3); // max edges per node

  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, nodeIdx: -1, ox: 0, oy: 0 });
  const panDragRef = useRef({ active: false, sx: 0, sy: 0 });
  const zoomRef = useRef(1);
  const zoomFittedRef = useRef(false);

  // ── Load graph data ──
  const loadGraph = async () => {
    try {
      setIsLoading(true); setError(''); setStarted(true);
      const data = await aiAPI.getKnowledgeGraph(documentId);
      if (data.graph && data.graph.nodes?.length > 0) {
        setGraphData(data.graph);
      } else if (data.nodes?.length > 0) {
        // Handle case where response IS the graph directly
        setGraphData(data);
      } else {
        setError('Không tìm thấy concepts. Hãy xử lý tài liệu trước.');
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi xây dựng knowledge graph. Kiểm tra AI server.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Initialize engine + renderer when data arrives ──
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const parent = containerRef.current;
    if (!parent) return;

    const engine = new ForceEngine();
    const renderer = new GraphRenderer(canvas);
    engineRef.current = engine;
    rendererRef.current = renderer;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    engine.setSize(w, h);
    renderer.resize(w, h);
    engine.setGraph(graphData.nodes || [], pruneEdges(graphData.edges || [], graphData.nodes || [], edgeDensity));

    // Reset view
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    zoomFittedRef.current = false;
    setZoom(1);
    setSelectedNode(-1);

    startAnimation();

    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [graphData, edgeDensity]);

  /**
   * pruneEdges — Keep only the N strongest edges per node
   * This is the KEY fix for the spaghetti graph problem.
   * With 30 nodes and 142 edges, the graph is unreadable.
   * Pruning to max 3 edges/node reduces to ~45 clean edges.
   */
  function pruneEdges(edges, nodes, maxPerNode = 3) {
    if (!edges || edges.length === 0) return edges;
    
    // Sort edges by weight (strongest first)
    const sorted = [...edges].sort((a, b) => (b.weight || 0.5) - (a.weight || 0.5));
    
    // Track how many edges each node has
    const nodeCounts = {};
    const kept = [];
    
    for (const edge of sorted) {
      const sc = nodeCounts[edge.source] || 0;
      const tc = nodeCounts[edge.target] || 0;
      
      // Keep edge if both nodes still have capacity
      if (sc < maxPerNode && tc < maxPerNode) {
        kept.push(edge);
        nodeCounts[edge.source] = sc + 1;
        nodeCounts[edge.target] = tc + 1;
      }
    }
    
    return kept;
  }

  // ── Animation loop ──
  const startAnimation = useCallback(() => {
    const animate = () => {
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!engine || !renderer) return;

      const pinnedIdx = dragRef.current.active ? dragRef.current.nodeIdx : -1;
      const active = engine.tick(pinnedIdx);

      // Auto zoom-to-fit when simulation first stabilizes
      if (!active && !zoomFittedRef.current) {
        zoomFittedRef.current = true;
        setTimeout(() => zoomToFit(), 50);
      }

      // Mark neighbors of selected node
      if (selectedNode >= 0) {
        const edges = engine.edges;
        const neighborSet = new Set();
        for (const e of edges) {
          if (e.sourceIdx === selectedNode) neighborSet.add(e.targetIdx);
          if (e.targetIdx === selectedNode) neighborSet.add(e.sourceIdx);
        }
        engine.nodes.forEach((n, i) => { n._isNeighbor = neighborSet.has(i); });
      } else {
        engine.nodes.forEach(n => { n._isNeighbor = false; });
      }

      renderer.selectedNode = selectedNode;
      renderer.render(engine.nodes, engine.edges, zoomRef.current, panRef.current.x, panRef.current.y);

      // Draw minimap
      drawMinimap();

      animRef.current = requestAnimationFrame(animate);
    };
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animate();
  }, [selectedNode]);

  // Re-start animation when selectedNode changes
  useEffect(() => {
    if (engineRef.current && rendererRef.current) startAnimation();
  }, [selectedNode, startAnimation]);

  // ── Minimap ──
  const drawMinimap = () => {
    const miniCanvas = minimapRef.current;
    const engine = engineRef.current;
    if (!miniCanvas || !engine || !engine.nodes.length) return;

    const ctx = miniCanvas.getContext('2d');
    const mw = 140, mh = 100;
    miniCanvas.width = mw; miniCanvas.height = mh;

    ctx.fillStyle = 'rgba(13,13,20,0.85)';
    ctx.fillRect(0, 0, mw, mh);

    const nodes = engine.nodes;
    const scaleX = mw / engine.width;
    const scaleY = mh / engine.height;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    const ox = (mw - engine.width * scale) / 2;
    const oy = (mh - engine.height * scale) / 2;

    // Edges
    ctx.strokeStyle = 'rgba(129,140,248,0.15)';
    ctx.lineWidth = 0.5;
    for (const e of engine.edges) {
      const a = nodes[e.sourceIdx], b = nodes[e.targetIdx];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(ox + a.x * scale, oy + a.y * scale);
      ctx.lineTo(ox + b.x * scale, oy + b.y * scale);
      ctx.stroke();
    }

    // Nodes
    const hasMastery = nodes.some(n => n.mastery != null);
    nodes.forEach((n, i) => {
      ctx.beginPath();
      ctx.arc(ox + n.x * scale, oy + n.y * scale, 2, 0, Math.PI * 2);
      ctx.fillStyle = hasMastery ? getMasteryColor(n.mastery || 0) : NODE_PALETTE[i % NODE_PALETTE.length];
      ctx.fill();
    });

    // Viewport rect
    const vx = (-panRef.current.x / zoomRef.current) * scale + ox;
    const vy = (-panRef.current.y / zoomRef.current) * scale + oy;
    const vw = (engine.width / zoomRef.current) * scale;
    const vh = (engine.height / zoomRef.current) * scale;
    ctx.strokeStyle = 'rgba(129,140,248,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);
  };

  // ── Mouse position helper ──
  const getWorldPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (e.clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  };

  // ── Mouse handlers ──
  const handleMouseDown = (e) => {
    const pos = getWorldPos(e);
    const renderer = rendererRef.current;
    const engine = engineRef.current;
    if (!renderer || !engine) return;

    const idx = renderer.findNodeAt(engine.nodes, pos.x, pos.y);
    if (idx >= 0) {
      dragRef.current = { active: true, nodeIdx: idx, ox: pos.x - engine.nodes[idx].x, oy: pos.y - engine.nodes[idx].y };
      setSelectedNode(idx);
    } else {
      panDragRef.current = { active: true, sx: e.clientX - panRef.current.x, sy: e.clientY - panRef.current.y };
      setSelectedNode(-1);
    }
  };

  const handleMouseMove = (e) => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!engine || !renderer) return;

    if (dragRef.current.active) {
      const pos = getWorldPos(e);
      const node = engine.nodes[dragRef.current.nodeIdx];
      if (node) {
        node.x = pos.x - dragRef.current.ox;
        node.y = pos.y - dragRef.current.oy;
        node.vx = 0; node.vy = 0;
        engine.reheat(0.05);
      }
    } else if (panDragRef.current.active) {
      panRef.current.x = e.clientX - panDragRef.current.sx;
      panRef.current.y = e.clientY - panDragRef.current.sy;
    } else {
      // Hover detection
      const pos = getWorldPos(e);
      const idx = renderer.findNodeAt(engine.nodes, pos.x, pos.y);
      renderer.hoveredNode = idx;
      canvasRef.current.style.cursor = idx >= 0 ? 'pointer' : 'grab';
    }
  };

  const handleMouseUp = () => {
    if (dragRef.current.active) engineRef.current?.reheat(0.15);
    dragRef.current.active = false;
    panDragRef.current.active = false;
  };

  // handleWheel is now handled via native event listener below (non-passive)


  // ── Resize ──
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      rendererRef.current?.resize(w, h);
      if (engineRef.current) engineRef.current.setSize(w, h);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [graphData]);

  // ── Wheel zoom — MUST use native addEventListener with {passive: false} ──
  // React's onWheel is passive by default → cannot preventDefault → page scrolls instead of zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return;

    const wheelHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;

      // Zoom toward mouse cursor position
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldZoom = zoomRef.current;
      const newZoom = Math.max(0.15, Math.min(5, oldZoom * delta));

      // Adjust pan so zoom centers on cursor
      panRef.current.x = mx - (mx - panRef.current.x) * (newZoom / oldZoom);
      panRef.current.y = my - (my - panRef.current.y) * (newZoom / oldZoom);

      zoomRef.current = newZoom;
      setZoom(newZoom);
    };

    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    return () => canvas.removeEventListener('wheel', wheelHandler);
  }, [graphData]);

  // ── Zoom-to-fit — calculate bounding box and center graph in viewport ──
  const zoomToFit = useCallback(() => {
    const engine = engineRef.current;
    const container = containerRef.current;
    if (!engine || !container || !engine.nodes.length) return;

    const nodes = engine.nodes;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - (n.radius || 20));
      minY = Math.min(minY, n.y - (n.radius || 20));
      maxX = Math.max(maxX, n.x + (n.radius || 20));
      maxY = Math.max(maxY, n.y + (n.radius || 20));
    }

    const graphW = maxX - minX + 120;
    const graphH = maxY - minY + 120;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const fitZoom = Math.min(containerW / graphW, containerH / graphH, 1.8);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    zoomRef.current = fitZoom;
    panRef.current.x = containerW / 2 - centerX * fitZoom;
    panRef.current.y = containerH / 2 - centerY * fitZoom;
    setZoom(fitZoom);
  }, []);

  // ── Keyboard: Ctrl+F search ──
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === 'f' && started && graphData) {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [started, graphData]);

  // ── Search: highlight matching node ──
  useEffect(() => {
    if (!searchQuery.trim() || !engineRef.current) return;
    const q = searchQuery.toLowerCase();
    const idx = engineRef.current.nodes.findIndex(n => n.concept.toLowerCase().includes(q));
    if (idx >= 0) {
      setSelectedNode(idx);
      // Pan to node
      const node = engineRef.current.nodes[idx];
      const parent = containerRef.current;
      if (node && parent) {
        panRef.current.x = parent.clientWidth / 2 - node.x * zoomRef.current;
        panRef.current.y = parent.clientHeight / 2 - node.y * zoomRef.current;
      }
    }
  }, [searchQuery]);

  // ── Zoom controls ──
  const zoomIn = () => { zoomRef.current = Math.min(4, zoomRef.current * 1.3); setZoom(zoomRef.current); };
  const zoomOut = () => { zoomRef.current = Math.max(0.15, zoomRef.current * 0.7); setZoom(zoomRef.current); };
  const resetView = () => { zoomToFit(); setSelectedNode(-1); };

  // ── Selected node data ──
  const selectedNodeData = selectedNode >= 0 ? engineRef.current?.nodes[selectedNode] : null;
  const selectedEdges = selectedNode >= 0
    ? (engineRef.current?.edges || []).filter(e => e.sourceIdx === selectedNode || e.targetIdx === selectedNode)
    : [];

  // ═══ RENDER ═══

  if (!started) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 'var(--space-xl)', padding: 'var(--space-xl)' }}>
        <div style={{ width: 80, height: 80, borderRadius: 'var(--radius-xl)', background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'float 6s ease-in-out infinite' }}>
          <Network size={36} style={{ color: '#f59e0b' }} strokeWidth={1.5} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>Knowledge Graph</h3>
          <p style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)', maxWidth: 420, lineHeight: 1.6 }}>
            Trực quan hóa quan hệ giữa các khái niệm trong tài liệu. Kéo thả, phóng to, và khám phá cách các ý tưởng kết nối với nhau.
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={loadGraph}>
          <Network size={18} /> Xây dựng Knowledge Graph
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 'var(--space-lg)' }}>
        <Loader2 size={32} style={{ color: 'var(--c-accent)', animation: 'rotate-slow 1s linear infinite' }} />
        <div style={{ fontSize: '0.9375rem', color: 'var(--c-text-secondary)' }}>Đang xây dựng knowledge graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 'var(--space-lg)' }}>
        <div style={{ color: 'var(--c-error)', fontSize: '0.9375rem' }}>{error}</div>
        <button className="btn btn-ghost" onClick={() => { setStarted(false); setError(''); }}>
          <RotateCcw size={16} /> Thử lại
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--c-border)', background: 'var(--c-bg-primary)' }}>
      {/* ── Canvas Container ── */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* ── Stats Overlay (top-left) ── */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'var(--c-bg-glass-strong)', borderRadius: 'var(--radius-md)',
          padding: '0.4rem 0.75rem', fontSize: '0.6875rem', color: 'var(--c-text-secondary)',
          border: '1px solid var(--c-border)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span><strong style={{ color: 'var(--c-text-primary)' }}>{graphData?.stats?.total_concepts || engineRef.current?.nodes.length || 0}</strong> concepts</span>
          <span style={{ color: 'var(--c-border)' }}>·</span>
          <span><strong style={{ color: 'var(--c-text-primary)' }}>{engineRef.current?.edges.length || 0}</strong> / {graphData?.edges?.length || 0} edges</span>
          {graphData?.stats?.communities > 0 && (
            <>
              <span style={{ color: 'var(--c-border)' }}>·</span>
              <span><strong style={{ color: '#f59e0b' }}>{graphData.stats.communities}</strong> clusters</span>
            </>
          )}
          {!graphData?.stats?.communities && graphData?.cluster_names && (
            <>
              <span style={{ color: 'var(--c-border)' }}>·</span>
              <span><strong style={{ color: '#f59e0b' }}>{Object.keys(graphData.cluster_names).length}</strong> clusters</span>
            </>
          )}
          <span style={{ color: 'var(--c-border)' }}>·</span>
          <span>{Math.round(zoomRef.current * 100)}%</span>
        </div>

        {/* ── Search Bar (top-center) ── */}
        {showSearch && (
          <div className="animate-fade-in" style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--c-bg-glass-strong)', borderRadius: 'var(--radius-full)',
            padding: '0.375rem 0.75rem', border: '1px solid var(--c-border-active)',
            backdropFilter: 'blur(12px)', minWidth: 240,
          }}>
            <Search size={13} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm khái niệm..."
              autoFocus
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                fontSize: '0.8125rem', color: 'var(--c-text-primary)', width: '100%',
                fontFamily: 'var(--font-sans)',
              }}
            />
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--c-text-tertiary)', display: 'flex', padding: 2,
            }}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Controls (bottom-right) ── */}
        <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { icon: ZoomIn, action: zoomIn, title: 'Phóng to' },
            { icon: ZoomOut, action: zoomOut, title: 'Thu nhỏ' },
            { icon: Maximize2, action: resetView, title: 'Reset view' },
            { icon: Search, action: () => setShowSearch(s => !s), title: 'Tìm kiếm (Ctrl+F)' },
            { icon: RotateCcw, action: loadGraph, title: 'Rebuild graph' },
          ].map(({ icon: Icon, action, title }, i) => (
            <button key={i} onClick={action} title={title} style={{
              width: 34, height: 34, borderRadius: 'var(--radius-md)',
              background: 'var(--c-bg-glass-strong)', border: '1px solid var(--c-border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)', color: 'var(--c-text-secondary)',
              transition: 'all var(--duration-fast)',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border-hover)'; e.currentTarget.style.color = 'var(--c-text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-secondary)'; }}
            >
              <Icon size={15} />
            </button>
          ))}

          {/* Edge density slider */}
          <div style={{
            background: 'var(--c-bg-glass-strong)', borderRadius: 'var(--radius-md)',
            padding: '6px 8px', border: '1px solid var(--c-border)',
            backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: '0.5rem', color: 'var(--c-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Edges</span>
            <input
              type="range"
              min={1}
              max={8}
              value={edgeDensity}
              onChange={e => setEdgeDensity(Number(e.target.value))}
              style={{ width: 28, accentColor: 'var(--c-accent)', writingMode: 'vertical-lr', direction: 'rtl', height: 50, cursor: 'pointer' }}
              title={`Max ${edgeDensity} edges per node`}
            />
            <span style={{ fontSize: '0.5625rem', color: 'var(--c-text-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{edgeDensity}</span>
          </div>
        </div>

        {/* ── Minimap (bottom-left) ── */}
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          borderRadius: 'var(--radius-md)', overflow: 'hidden',
          border: '1px solid var(--c-border)', boxShadow: 'var(--shadow-md)',
        }}>
          <canvas ref={minimapRef} width={140} height={100} style={{ display: 'block' }} />
        </div>

        {/* ── Legend (top-right) ── */}
        {engineRef.current?.nodes.some(n => n.mastery != null) && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            background: 'var(--c-bg-glass-strong)', borderRadius: 'var(--radius-md)',
            padding: '0.5rem 0.75rem', border: '1px solid var(--c-border)',
            backdropFilter: 'blur(12px)', fontSize: '0.625rem',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mastery</div>
            {[
              { label: 'Chưa học', color: getMasteryColor(0) },
              { label: 'Mới bắt đầu', color: getMasteryColor(0.25) },
              { label: 'Đang học', color: getMasteryColor(0.5) },
              { label: 'Thành thạo', color: getMasteryColor(1.0) },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ color: 'var(--c-text-tertiary)' }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Side Panel (selected node) ── */}
      {selectedNodeData && (
        <div className="animate-slide-in-right" style={{
          width: 260, borderLeft: '1px solid var(--c-border)',
          padding: 'var(--space-lg)', overflowY: 'auto',
          background: 'var(--c-bg-card)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Chi tiết khái niệm
            </div>
            <button onClick={() => setSelectedNode(-1)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--c-text-tertiary)', display: 'flex', padding: 2,
            }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--c-text-primary)', marginBottom: 'var(--space-lg)', letterSpacing: '-0.02em' }}>
            {selectedNodeData.concept}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Centrality', value: `${((selectedNodeData.centrality_score || 0) * 100).toFixed(1)}%` },
              { label: 'Connections', value: selectedEdges.length },
              { label: 'Related chunks', value: selectedNodeData.related_chunk_ids?.length || 0 },
              ...(selectedNodeData.community != null ? [{ label: 'Community', value: graphData?.cluster_names?.[selectedNodeData.community] || `Cluster ${selectedNodeData.community}` }] : []),
              ...(selectedNodeData.mastery != null ? [{ label: 'Mastery', value: `${Math.round(selectedNodeData.mastery * 100)}%` }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--c-text-tertiary)' }}>{label}</span>
                <span style={{ color: 'var(--c-text-primary)', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Mastery bar */}
          {selectedNodeData.mastery != null && (
            <div style={{ marginTop: 'var(--space-md)' }}>
              <div className="progress-bar" style={{ height: 4 }}>
                <div className="progress-bar-fill" style={{
                  width: `${Math.round(selectedNodeData.mastery * 100)}%`,
                  background: getMasteryColor(selectedNodeData.mastery),
                }} />
              </div>
            </div>
          )}

          {/* Connected concepts */}
          <div style={{ marginTop: 'var(--space-xl)' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 'var(--space-sm)' }}>
              Kết nối tới
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {selectedEdges.map((e, i) => {
                const otherIdx = e.sourceIdx === selectedNode ? e.targetIdx : e.sourceIdx;
                const other = engineRef.current?.nodes[otherIdx];
                if (!other) return null;
                return (
                  <button key={i} onClick={() => setSelectedNode(otherIdx)} style={{
                    fontSize: '0.6875rem', padding: '0.25rem 0.625rem',
                    borderRadius: 'var(--radius-full)', background: 'var(--c-accent-glow)',
                    color: 'var(--c-accent)', cursor: 'pointer', fontWeight: 500,
                    border: 'none', transition: 'all var(--duration-fast)',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-accent-glow)'; }}
                  >
                    {other.concept}
                    {e.relation && <span style={{ marginLeft: 4, opacity: 0.6 }}>({e.relation})</span>}
                  </button>
                );
              })}
              {selectedEdges.length === 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>Không có kết nối</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
