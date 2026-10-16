/**
 * ForceEngine — Self-built Force-Directed Layout Engine
 * Barnes-Hut approximation (O(n log n)) cho performance tốt hơn O(n²)
 * Adaptive cooling, velocity verlet integration
 * 100% tự viết, không dùng D3.js
 */

// ── Quadtree cho Barnes-Hut ──
class QuadTreeNode {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.body = null; // single node stored here
    this.mass = 0; this.cx = 0; this.cy = 0; // center of mass
    this.children = null; // [NW, NE, SW, SE]
  }

  insert(node) {
    if (this.mass === 0 && !this.body) {
      this.body = node;
      this.mass = 1;
      this.cx = node.x;
      this.cy = node.y;
      return;
    }

    if (!this.children) {
      this._subdivide();
      if (this.body) {
        this._insertChild(this.body);
        this.body = null;
      }
    }

    this._insertChild(node);
    // Update center of mass
    const newMass = this.mass + 1;
    this.cx = (this.cx * this.mass + node.x) / newMass;
    this.cy = (this.cy * this.mass + node.y) / newMass;
    this.mass = newMass;
  }

  _subdivide() {
    const hw = this.w / 2, hh = this.h / 2;
    this.children = [
      new QuadTreeNode(this.x, this.y, hw, hh),           // NW
      new QuadTreeNode(this.x + hw, this.y, hw, hh),      // NE
      new QuadTreeNode(this.x, this.y + hh, hw, hh),      // SW
      new QuadTreeNode(this.x + hw, this.y + hh, hw, hh), // SE
    ];
  }

  _insertChild(node) {
    const mx = this.x + this.w / 2, my = this.y + this.h / 2;
    const idx = (node.x < mx ? 0 : 1) + (node.y < my ? 0 : 2);
    this.children[idx].insert(node);
  }

  /**
   * Barnes-Hut force calculation
   * theta = 0.8 (threshold — lower = more accurate but slower)
   */
  computeForce(node, theta, repulsion) {
    if (this.mass === 0) return { fx: 0, fy: 0 };

    const dx = this.cx - node.x;
    const dy = this.cy - node.y;
    const distSq = dx * dx + dy * dy + 1; // +1 to avoid division by zero
    const dist = Math.sqrt(distSq);

    // If this cell is far enough, treat as single body
    if (this.children === null || (this.w / dist) < theta) {
      if (this.body === node) return { fx: 0, fy: 0 };
      const force = -repulsion * this.mass / distSq;
      return { fx: (dx / dist) * force, fy: (dy / dist) * force };
    }

    // Otherwise recurse into children
    let fx = 0, fy = 0;
    for (const child of this.children) {
      const f = child.computeForce(node, theta, repulsion);
      fx += f.fx;
      fy += f.fy;
    }
    return { fx, fy };
  }
}

/**
 * ForceEngine class — manages physics simulation
 */
export default class ForceEngine {
  constructor(options = {}) {
    this.repulsion = options.repulsion || 15000;
    this.attraction = options.attraction || 0.006;
    this.centerPull = options.centerPull || 0.003;
    this.damping = options.damping || 0.88;
    this.idealEdgeLength = options.idealEdgeLength || 200;
    this.theta = options.theta || 0.8; // Barnes-Hut threshold
    this.maxVelocity = options.maxVelocity || 15;
    this.clusterGravity = options.clusterGravity || 0.008;
    this.clusterRepulsion = options.clusterRepulsion || 3000;

    this.alpha = 1.0; // cooling factor
    this.alphaDecay = options.alphaDecay || 0.003;
    this.alphaMin = 0.005;

    this.nodes = [];
    this.edges = [];
    this.width = 800;
    this.height = 600;
    this.running = false;
    this.clusterCentroids = {}; // community_id → {x, y}
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
  }

  setGraph(nodes, edges) {
    const cx = this.width / 2, cy = this.height / 2;

    // Auto-scale physics based on graph size for better readability
    const n = nodes.length;
    if (n > 30) {
      this.repulsion = 28000;
      this.idealEdgeLength = Math.min(400, 160 + n * 5);
      this.clusterRepulsion = 5000;
    } else if (n > 15) {
      this.repulsion = 20000;
      this.idealEdgeLength = 250;
      this.clusterRepulsion = 4000;
    } else {
      this.repulsion = 15000;
      this.idealEdgeLength = 200;
    }

    // Discover unique communities for cluster-aware initial placement
    const communities = [...new Set(nodes.map(n => n.community ?? 0))];
    const numClusters = Math.max(communities.length, 1);

    // Place each cluster's nodes around a distinct angle on a larger ring
    const clusterAngleMap = {};
    communities.forEach((c, i) => {
      clusterAngleMap[c] = (2 * Math.PI * i) / numClusters;
    });

    this.nodes = nodes.map((n, i) => {
      const comm = n.community ?? 0;
      const clusterAngle = clusterAngleMap[comm] ?? 0;
      // Cluster center on outer ring
      const clusterR = Math.min(this.width, this.height) * 0.25;
      const ccx = cx + clusterR * Math.cos(clusterAngle);
      const ccy = cy + clusterR * Math.sin(clusterAngle);
      // Spread nodes within cluster
      const localAngle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
      const localR = 40 + Math.random() * 30;
      return {
        ...n,
        x: ccx + localR * Math.cos(localAngle) + (Math.random() - 0.5) * 20,
        y: ccy + localR * Math.sin(localAngle) + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        radius: Math.max(20, Math.min(40, 14 + (n.centrality_score || 0) * 65)),
        degree: 0,
      };
    });

    this.edges = edges.map(e => ({
      ...e,
      sourceIdx: this.nodes.findIndex(n => n.concept === e.source),
      targetIdx: this.nodes.findIndex(n => n.concept === e.target),
    })).filter(e => e.sourceIdx >= 0 && e.targetIdx >= 0);

    // Calculate degree for each node
    for (const edge of this.edges) {
      this.nodes[edge.sourceIdx].degree = (this.nodes[edge.sourceIdx].degree || 0) + 1;
      this.nodes[edge.targetIdx].degree = (this.nodes[edge.targetIdx].degree || 0) + 1;
    }

    this.alpha = 1.0;
  }

  /** Reheat simulation (e.g., after drag) */
  reheat(amount = 0.3) {
    this.alpha = Math.min(1.0, this.alpha + amount);
  }

  /** Single simulation tick — returns true if still active */
  tick(pinnedNodeIndex = -1) {
    if (this.alpha < this.alphaMin) return false;

    const nodes = this.nodes;
    const edges = this.edges;
    if (!nodes.length) return false;

    const W = this.width, H = this.height;
    const effectiveRepulsion = this.repulsion * this.alpha;

    // ── Build Quadtree ──
    const qt = new QuadTreeNode(0, 0, W, H);
    for (const node of nodes) qt.insert(node);

    // ── Repulsive forces (Barnes-Hut) ──
    for (const node of nodes) {
      const f = qt.computeForce(node, this.theta, effectiveRepulsion);
      node.vx += f.fx;
      node.vy += f.fy;
    }

    // ── Attractive forces along edges ──
    for (const edge of edges) {
      const a = nodes[edge.sourceIdx], b = nodes[edge.targetIdx];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = (dist - this.idealEdgeLength) * this.attraction * this.alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // ── Center gravity ──
    for (const node of nodes) {
      node.vx += (W / 2 - node.x) * this.centerPull * this.alpha;
      node.vy += (H / 2 - node.y) * this.centerPull * this.alpha;
    }

    // ── Cluster forces (Phase 1 Upgrade) ──
    // 1. Compute cluster centroids
    const clusterNodes = {};
    for (const node of nodes) {
      const c = node.community ?? 0;
      if (!clusterNodes[c]) clusterNodes[c] = { sx: 0, sy: 0, count: 0 };
      clusterNodes[c].sx += node.x;
      clusterNodes[c].sy += node.y;
      clusterNodes[c].count++;
    }
    const centroids = {};
    for (const [c, data] of Object.entries(clusterNodes)) {
      centroids[c] = { x: data.sx / data.count, y: data.sy / data.count };
    }
    this.clusterCentroids = centroids;

    // 2. Pull nodes toward their cluster centroid
    for (const node of nodes) {
      const c = node.community ?? 0;
      const centroid = centroids[c];
      if (centroid) {
        node.vx += (centroid.x - node.x) * this.clusterGravity * this.alpha;
        node.vy += (centroid.y - node.y) * this.clusterGravity * this.alpha;
      }
    }

    // 3. Push cluster centroids apart
    const clusterIds = Object.keys(centroids);
    for (let i = 0; i < clusterIds.length; i++) {
      for (let j = i + 1; j < clusterIds.length; j++) {
        const ci = centroids[clusterIds[i]], cj = centroids[clusterIds[j]];
        const dx = cj.x - ci.x, dy = cj.y - ci.y;
        const distSq = dx * dx + dy * dy + 1;
        const dist = Math.sqrt(distSq);
        const force = -this.clusterRepulsion * this.alpha / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        // Apply to all nodes in each cluster
        const countI = clusterNodes[clusterIds[i]].count;
        const countJ = clusterNodes[clusterIds[j]].count;
        for (const node of nodes) {
          const nc = String(node.community ?? 0);
          if (nc === clusterIds[i]) {
            node.vx += fx / countI;
            node.vy += fy / countI;
          } else if (nc === clusterIds[j]) {
            node.vx -= fx / countJ;
            node.vy -= fy / countJ;
          }
        }
      }
    }

    // ── Apply velocity (Velocity Verlet) ──
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (i === pinnedNodeIndex) { node.vx = 0; node.vy = 0; continue; }

      node.vx *= this.damping;
      node.vy *= this.damping;

      // Clamp velocity
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > this.maxVelocity) {
        node.vx = (node.vx / speed) * this.maxVelocity;
        node.vy = (node.vy / speed) * this.maxVelocity;
      }

      node.x += node.vx;
      node.y += node.vy;

      // Boundary constraint (soft)
      const margin = 50;
      node.x = Math.max(margin, Math.min(W - margin, node.x));
      node.y = Math.max(margin, Math.min(H - margin, node.y));
    }

    // ── Cool down ──
    this.alpha = Math.max(this.alphaMin, this.alpha - this.alphaDecay);
    return this.alpha > this.alphaMin;
  }
}
