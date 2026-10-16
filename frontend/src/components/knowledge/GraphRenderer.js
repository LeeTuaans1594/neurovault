/**
 * GraphRenderer v4 — Excalidraw-style Canvas rendering
 * 
 * Design:
 * - Rounded rectangle "card" nodes (like Excalidraw shapes)
 * - Soft hand-drawn-feel edges with curved bezier lines
 * - Clean label typography (outside/inside cards)
 * - Subtle cluster background regions
 * - Pastel color palette with gentle shadows
 * - Edge labels on curves, not on straight lines
 */

// ── Mastery Color Scale ──
const MASTERY_COLORS = [
  { threshold: 0.0, color: [239, 68, 68] },
  { threshold: 0.25, color: [249, 115, 22] },
  { threshold: 0.5, color: [245, 158, 11] },
  { threshold: 0.75, color: [34, 197, 94] },
  { threshold: 1.0, color: [16, 185, 129] },
];

function getMasteryColor(mastery = 0) {
  const m = Math.max(0, Math.min(1, mastery));
  for (let i = MASTERY_COLORS.length - 1; i >= 0; i--) {
    if (m >= MASTERY_COLORS[i].threshold) {
      const c = MASTERY_COLORS[i].color;
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return 'rgb(107, 107, 128)';
}

function getMasteryColorAlpha(mastery = 0, alpha = 1) {
  const m = Math.max(0, Math.min(1, mastery));
  for (let i = MASTERY_COLORS.length - 1; i >= 0; i--) {
    if (m >= MASTERY_COLORS[i].threshold) {
      const c = MASTERY_COLORS[i].color;
      return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
    }
  }
  return `rgba(107, 107, 128, ${alpha})`;
}

// ── Fallback palette ──
const NODE_PALETTE = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#10b981', '#14b8a6',
  '#f59e0b', '#ec4899', '#3b82f6', '#06b6d4', '#f97316',
];

// ── Excalidraw-style Cluster Colors ──
const CLUSTER_COLORS = [
  { fill: '#818cf8', bg: 'rgba(129,140,248,0.05)', cardBg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.35)', text: '#c7d2fe' },
  { fill: '#f59e0b', bg: 'rgba(245,158,11,0.05)', cardBg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)', text: '#fde68a' },
  { fill: '#34d399', bg: 'rgba(52,211,153,0.05)', cardBg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.35)', text: '#a7f3d0' },
  { fill: '#f472b6', bg: 'rgba(244,114,182,0.05)', cardBg: 'rgba(244,114,182,0.08)', border: 'rgba(244,114,182,0.35)', text: '#fbcfe8' },
  { fill: '#60a5fa', bg: 'rgba(96,165,250,0.05)', cardBg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.35)', text: '#bfdbfe' },
  { fill: '#a78bfa', bg: 'rgba(167,139,250,0.05)', cardBg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.35)', text: '#ddd6fe' },
  { fill: '#2dd4bf', bg: 'rgba(45,212,191,0.05)', cardBg: 'rgba(45,212,191,0.08)', border: 'rgba(45,212,191,0.35)', text: '#99f6e4' },
  { fill: '#fb923c', bg: 'rgba(251,146,60,0.05)', cardBg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.35)', text: '#fed7aa' },
  { fill: '#e879f9', bg: 'rgba(232,121,249,0.05)', cardBg: 'rgba(232,121,249,0.08)', border: 'rgba(232,121,249,0.35)', text: '#f5d0fe' },
  { fill: '#fbbf24', bg: 'rgba(251,191,36,0.05)', cardBg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.35)', text: '#fef3c7' },
];

/**
 * GraphRenderer class — Excalidraw-inspired design
 */
export default class GraphRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.hoveredNode = -1;
    this.selectedNode = -1;
    this.hasMasteryData = false;
  }

  resize(width, height) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(nodes, edges, zoom, panX, panY) {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    this.hasMasteryData = nodes.some(n => n.mastery !== undefined && n.mastery !== null);

    // Dark canvas background with subtle grid
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw dot grid (Excalidraw style)
    if (zoom > 0.3) {
      this._drawDotGrid(ctx, panX, panY, zoom, w, h);
    }

    const showLabels = zoom > 0.25;
    const showDetails = zoom > 0.5;

    // ── Draw cluster regions first (background) ──
    if (showDetails) {
      this._drawClusterRegions(ctx, nodes);
    }

    // ── Draw edges (bezier curves) ──
    this._drawEdges(ctx, nodes, edges, zoom, showDetails);

    // ── Draw nodes (rounded rect cards) ──
    this._drawNodes(ctx, nodes, zoom, showLabels, showDetails);

    // ── Draw tooltip for hovered node ──
    if (this.hoveredNode >= 0 && this.hoveredNode < nodes.length && this.hoveredNode !== this.selectedNode) {
      this._drawTooltip(ctx, nodes[this.hoveredNode], nodes, edges);
    }

    ctx.restore();
  }

  // ── Excalidraw-style dot grid ──
  _drawDotGrid(ctx, panX, panY, zoom, w, h) {
    const spacing = 40;
    const startX = Math.floor(-panX / zoom / spacing) * spacing - spacing;
    const startY = Math.floor(-panY / zoom / spacing) * spacing - spacing;
    const endX = startX + w / zoom + spacing * 2;
    const endY = startY + h / zoom + spacing * 2;

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = startX; x < endX; x += spacing) {
      for (let y = startY; y < endY; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── Cluster background regions ──
  _drawClusterRegions(ctx, nodes) {
    const clusters = {};
    nodes.forEach((n, i) => {
      const c = n.community ?? 0;
      if (!clusters[c]) clusters[c] = [];
      clusters[c].push(n);
    });

    for (const [clusterId, clusterNodes] of Object.entries(clusters)) {
      if (clusterNodes.length < 2) continue;

      const cc = CLUSTER_COLORS[parseInt(clusterId) % CLUSTER_COLORS.length];

      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of clusterNodes) {
        minX = Math.min(minX, n.x - n.radius - 30);
        minY = Math.min(minY, n.y - n.radius - 30);
        maxX = Math.max(maxX, n.x + n.radius + 30);
        maxY = Math.max(maxY, n.y + n.radius + 30);
      }

      const pad = 35;
      const rx = minX - pad, ry = minY - pad;
      const rw = maxX - minX + pad * 2;
      const rh = maxY - minY + pad * 2;
      const cornerR = 16;

      // Subtle background fill
      ctx.fillStyle = cc.bg;
      this._roundRect(ctx, rx, ry, rw, rh, cornerR);
      ctx.fill();

      // Dashed border
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = cc.border.replace(/[\d.]+\)$/, '0.15)');
      ctx.lineWidth = 1.5;
      this._roundRect(ctx, rx, ry, rw, rh, cornerR);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cluster label in top-left
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = cc.border.replace(/[\d.]+\)$/, '0.5)');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Cluster ${parseInt(clusterId) + 1}`, rx + 12, ry + 8);
    }
  }

  // ── Bezier curve edges (Excalidraw-style) ──
  _drawEdges(ctx, nodes, edges, zoom, showDetails) {
    for (const edge of edges) {
      const a = nodes[edge.sourceIdx], b = nodes[edge.targetIdx];
      if (!a || !b) continue;

      const isHighlighted = this.selectedNode >= 0 &&
        (edge.sourceIdx === this.selectedNode || edge.targetIdx === this.selectedNode);
      const isDimmed = this.selectedNode >= 0 && !isHighlighted;

      if (isDimmed) {
        // Very faint for dimmed edges
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        continue;
      }

      const weight = edge.weight || 0.5;
      const alpha = isHighlighted ? 0.7 : (0.15 + weight * 0.2);
      const lineWidth = isHighlighted ? 2.5 : (1.2 + weight * 0.8);

      // Calculate bezier control point for curved edge
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      // Perpendicular offset for curve (scale with distance)
      const curvature = Math.min(dist * 0.12, 40);
      const nx = -dy / (dist || 1);
      const ny = dx / (dist || 1);
      const cpx = midX + nx * curvature;
      const cpy = midY + ny * curvature;

      // Draw curved line
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
      ctx.strokeStyle = isHighlighted
        ? `rgba(129, 140, 248, ${alpha})`
        : `rgba(180, 190, 210, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Arrow at target end
      if (showDetails) {
        this._drawArrow(ctx, a, b, cpx, cpy, lineWidth, alpha, isHighlighted);
      }

      // Edge label on curve
      if (showDetails && edge.relation && zoom > 0.8) {
        const labelX = (a.x + 2 * cpx + b.x) / 4;
        const labelY = (a.y + 2 * cpy + b.y) / 4;

        // Label background pill
        ctx.font = '500 8px Inter, sans-serif';
        const textW = ctx.measureText(edge.relation).width;
        const pillW = textW + 10;
        const pillH = 14;

        ctx.fillStyle = 'rgba(13, 13, 20, 0.85)';
        this._roundRect(ctx, labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, 4);
        ctx.fill();

        ctx.fillStyle = `rgba(180, 190, 210, ${alpha * 1.2})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(edge.relation, labelX, labelY);
      }
    }
  }

  _drawArrow(ctx, a, b, cpx, cpy, lineWidth, alpha, isHighlighted) {
    const targetRadius = b.radius || 20;
    // Arrow point: along the bezier curve, offset by target radius
    const dx = b.x - cpx, dy = b.y - cpy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const ratio = (dist - targetRadius - 4) / dist;
    const tipX = cpx + dx * ratio;
    const tipY = cpy + dy * ratio;

    const angle = Math.atan2(b.y - cpx > b.y - tipY ? dy : b.y - tipY, b.x - cpx > b.x - tipX ? dx : b.x - tipX);
    const arrowLen = 7 + lineWidth;
    const spread = 0.35;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - arrowLen * Math.cos(angle - spread), tipY - arrowLen * Math.sin(angle - spread));
    ctx.lineTo(tipX - arrowLen * Math.cos(angle + spread), tipY - arrowLen * Math.sin(angle + spread));
    ctx.closePath();
    ctx.fillStyle = isHighlighted
      ? `rgba(129, 140, 248, ${alpha})`
      : `rgba(180, 190, 210, ${alpha})`;
    ctx.fill();
  }

  // ── Rounded Rectangle Card Nodes (Excalidraw-style) ──
  _drawNodes(ctx, nodes, zoom, showLabels, showDetails) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isSelected = i === this.selectedNode;
      const isHovered = i === this.hoveredNode;
      const isNeighbor = this._isNeighborOfSelected(i, nodes);
      const isDimmed = this.selectedNode >= 0 && !isSelected && !isNeighbor;

      // Color from cluster or mastery
      let cc = null;
      let color;
      if (this.hasMasteryData) {
        color = getMasteryColor(node.mastery || 0);
      } else if (node.community !== undefined && node.community !== null) {
        cc = CLUSTER_COLORS[node.community % CLUSTER_COLORS.length];
        color = cc.fill;
      } else {
        color = NODE_PALETTE[i % NODE_PALETTE.length];
      }

      const r = node.radius;
      const alpha = isDimmed ? 0.12 : 1;

      // Card dimensions — proportional to node importance
      const cardW = Math.max(80, r * 3.2);
      const cardH = Math.max(32, r * 1.5);
      const cardX = node.x - cardW / 2;
      const cardY = node.y - cardH / 2;
      const cornerR = 10;

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── Selection glow ──
      if ((isSelected || isHovered) && !isDimmed) {
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected ? 20 : 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // ── Card background ──
      const bgColor = cc ? cc.cardBg : `${color}14`;
      ctx.fillStyle = isDimmed ? 'rgba(30,30,40,0.4)' : bgColor;
      this._roundRect(ctx, cardX, cardY, cardW, cardH, cornerR);
      ctx.fill();

      // Reset shadow before border
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // ── Card border ──
      ctx.strokeStyle = isSelected
        ? color
        : (isHovered ? `${color}cc` : (cc ? cc.border : `${color}33`));
      ctx.lineWidth = isSelected ? 2 : (isHovered ? 1.5 : 1);
      this._roundRect(ctx, cardX, cardY, cardW, cardH, cornerR);
      ctx.stroke();

      // ── Small colored dot (left side indicator) ──
      if (!isDimmed) {
        const dotR = 4;
        const dotX = cardX + 14;
        const dotY = node.y;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // ── Label text ──
      if (showLabels && !isDimmed) {
        const maxLen = showDetails ? 22 : 14;
        const label = node.concept.length > maxLen
          ? node.concept.slice(0, maxLen - 1) + '…'
          : node.concept;

        const fontSize = Math.max(9, Math.min(12, r * 0.45));
        ctx.font = `${isSelected ? '700' : '500'} ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = cc ? cc.text : '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cardX + 24, node.y);
      }

      // ── Mastery progress bar (bottom of card) ──
      if (showDetails && this.hasMasteryData && !isDimmed) {
        const mastery = node.mastery || 0;
        const barW = cardW - 16;
        const barH = 3;
        const barX = cardX + 8;
        const barY = cardY + cardH - 8;

        // Bar background
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        this._roundRect(ctx, barX, barY, barW, barH, 1.5);
        ctx.fill();

        // Bar fill
        ctx.fillStyle = getMasteryColorAlpha(mastery, 0.8);
        this._roundRect(ctx, barX, barY, barW * mastery, barH, 1.5);
        ctx.fill();
      }

      // ── Centrality badge (small) ──
      if (showDetails && !isDimmed && node.degree > 3) {
        const badgeText = `${node.degree}`;
        ctx.font = '600 7px Inter, sans-serif';
        const tw = ctx.measureText(badgeText).width;
        const bx = cardX + cardW - tw - 12;
        const by = cardY + 6;

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        this._roundRect(ctx, bx, by, tw + 8, 12, 3);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx + (tw + 8) / 2, by + 6);
      }

      ctx.restore();
    }
  }

  _drawTooltip(ctx, node, nodes, edges) {
    const cardW = Math.max(80, node.radius * 3.2);
    const x = node.x + cardW / 2 + 12;
    const y = node.y - 30;
    const padding = 12;
    const lines = [
      node.concept,
      `Centrality: ${((node.centrality_score || 0) * 100).toFixed(1)}%`,
      `Connections: ${node.degree || 0}`,
    ];
    if (node.community !== undefined && node.community !== null) {
      lines.push(`Cluster: ${(node.community ?? 0) + 1}`);
    }
    if (this.hasMasteryData) {
      lines.push(`Mastery: ${Math.round((node.mastery || 0) * 100)}%`);
    }

    ctx.font = '500 11px Inter, sans-serif';
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
    const w = maxWidth + padding * 2;
    const h = lines.length * 18 + padding * 2;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    // Background
    ctx.fillStyle = 'rgba(18, 18, 28, 0.95)';
    ctx.strokeStyle = 'rgba(129,140,248,0.2)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.font = i === 0 ? '700 12px Inter, sans-serif' : '400 10px Inter, sans-serif';
      ctx.fillStyle = i === 0 ? '#f1f5f9' : '#94a3b8';
      ctx.fillText(line, x + padding, y + padding + i * 18);
    });
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  _isNeighborOfSelected(nodeIdx, nodes) {
    if (this.selectedNode < 0) return false;
    return nodes[nodeIdx]?._isNeighbor || false;
  }

  /** Hit test — updated for card-shaped nodes */
  findNodeAt(nodes, mx, my) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const cardW = Math.max(80, node.radius * 3.2);
      const cardH = Math.max(32, node.radius * 1.5);
      const cardX = node.x - cardW / 2;
      const cardY = node.y - cardH / 2;
      if (mx >= cardX && mx <= cardX + cardW && my >= cardY && my <= cardY + cardH) {
        return i;
      }
    }
    return -1;
  }
}

export { getMasteryColor, getMasteryColorAlpha, NODE_PALETTE };
