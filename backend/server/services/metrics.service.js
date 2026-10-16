/**
 * NEUROVAULT — Metrics Collector Service
 * Centralized real-time metrics collection for system monitoring.
 * 
 * Tracks:
 * - Request throughput (RPM), latency (p50, p95, p99)
 * - Error rates per route
 * - Active connections count
 * - Memory / CPU usage
 * - Database query performance
 * - Cache hit rates
 * 
 * All data stored in-memory with circular buffers.
 * For production: pipe to Prometheus/Grafana.
 */

// ══════════════════════════════════════════════
// CIRCULAR BUFFER — Fixed-size FIFO
// ══════════════════════════════════════════════

class CircularBuffer {
  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.buffer = [];
    this.index = 0;
  }

  push(item) {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(item);
    } else {
      this.buffer[this.index % this.capacity] = item;
    }
    this.index++;
  }

  getAll() {
    return [...this.buffer].sort((a, b) => a.timestamp - b.timestamp);
  }

  getLast(n) {
    const all = this.getAll();
    return all.slice(-n);
  }

  get size() {
    return this.buffer.length;
  }

  clear() {
    this.buffer = [];
    this.index = 0;
  }
}

// ══════════════════════════════════════════════
// METRICS STATE
// ══════════════════════════════════════════════

const state = {
  startTime: Date.now(),
  requests: new CircularBuffer(5000),
  errors: new CircularBuffer(500),
  activeConnections: 0,
  counters: {
    totalRequests: 0,
    totalErrors: 0,
    total2xx: 0,
    total4xx: 0,
    total5xx: 0,
  },
  routeStats: new Map(), // path → { count, totalMs, errors }
};

// ══════════════════════════════════════════════
// MIDDLEWARE — Auto-track every request
// ══════════════════════════════════════════════

/**
 * Express middleware to collect request metrics.
 * Mount early in the middleware chain.
 */
export function metricsMiddleware(req, res, next) {
  state.activeConnections++;
  const startTime = Date.now();

  res.on('finish', () => {
    state.activeConnections = Math.max(0, state.activeConnections - 1);
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Record request
    const entry = {
      timestamp: Date.now(),
      method: req.method,
      path: req.route?.path || req.path,
      statusCode,
      duration,
      userId: req.userId?.toString() || null,
    };

    state.requests.push(entry);
    state.counters.totalRequests++;

    if (statusCode >= 500) {
      state.counters.total5xx++;
      state.counters.totalErrors++;
      state.errors.push({
        ...entry,
        error: res.statusMessage,
      });
    } else if (statusCode >= 400) {
      state.counters.total4xx++;
    } else if (statusCode >= 200 && statusCode < 300) {
      state.counters.total2xx++;
    }

    // Per-route stats
    const routeKey = `${req.method} ${req.route?.path || req.path}`;
    if (!state.routeStats.has(routeKey)) {
      state.routeStats.set(routeKey, { count: 0, totalMs: 0, errors: 0, maxMs: 0 });
    }
    const route = state.routeStats.get(routeKey);
    route.count++;
    route.totalMs += duration;
    route.maxMs = Math.max(route.maxMs, duration);
    if (statusCode >= 400) route.errors++;
  });

  next();
}

// ══════════════════════════════════════════════
// COMPUTED METRICS
// ══════════════════════════════════════════════

/**
 * Calculate percentile from sorted durations.
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Get comprehensive system metrics snapshot.
 */
export function getMetrics() {
  const now = Date.now();
  const uptime = Math.round((now - state.startTime) / 1000);

  // Requests in last minute
  const oneMinAgo = now - 60 * 1000;
  const recentRequests = state.requests.getAll().filter(r => r.timestamp > oneMinAgo);
  const rpm = recentRequests.length;

  // Latency percentiles (from last 1000 requests)
  const latencies = state.requests.getLast(1000).map(r => r.duration).sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length)
    : 0;

  // Error rate (last minute)
  const recentErrors = recentRequests.filter(r => r.statusCode >= 400).length;
  const errorRate = rpm > 0 ? Math.round((recentErrors / rpm) * 100 * 10) / 10 : 0;

  // Memory
  const mem = process.memoryUsage();

  // Top routes by request count
  const topRoutes = [...state.routeStats.entries()]
    .map(([path, stats]) => ({
      path,
      count: stats.count,
      avgMs: stats.count > 0 ? Math.round(stats.totalMs / stats.count) : 0,
      maxMs: stats.maxMs,
      errorRate: stats.count > 0 ? Math.round((stats.errors / stats.count) * 100 * 10) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Recent errors
  const recentErrorList = state.errors.getLast(10).map(e => ({
    timestamp: new Date(e.timestamp).toISOString(),
    method: e.method,
    path: e.path,
    statusCode: e.statusCode,
    duration: e.duration,
  }));

  return {
    system: {
      uptime,
      uptimeHuman: formatUptime(uptime),
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    },
    throughput: {
      rpm,
      totalRequests: state.counters.totalRequests,
      activeConnections: state.activeConnections,
    },
    latency: {
      p50,
      p95,
      p99,
      avg: avgLatency,
    },
    errors: {
      rate: errorRate,
      total: state.counters.totalErrors,
      recent: recentErrorList,
      breakdown: {
        '2xx': state.counters.total2xx,
        '4xx': state.counters.total4xx,
        '5xx': state.counters.total5xx,
      },
    },
    memory: {
      heapUsed: formatBytes(mem.heapUsed),
      heapTotal: formatBytes(mem.heapTotal),
      rss: formatBytes(mem.rss),
      external: formatBytes(mem.external),
      heapPercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
    },
    routes: topRoutes,
  };
}

/**
 * Get time-series data for charts (last N minutes, bucketed per minute).
 */
export function getTimeSeries(minutes = 30) {
  const now = Date.now();
  const buckets = [];

  for (let i = minutes - 1; i >= 0; i--) {
    const bucketStart = now - (i + 1) * 60 * 1000;
    const bucketEnd = now - i * 60 * 1000;

    const requests = state.requests.getAll().filter(
      r => r.timestamp >= bucketStart && r.timestamp < bucketEnd
    );

    const errors = requests.filter(r => r.statusCode >= 400).length;
    const latencies = requests.map(r => r.duration).sort((a, b) => a - b);

    buckets.push({
      time: new Date(bucketEnd).toISOString(),
      rpm: requests.length,
      errors,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    });
  }

  return buckets;
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics() {
  state.requests.clear();
  state.errors.clear();
  state.activeConnections = 0;
  state.counters = { totalRequests: 0, totalErrors: 0, total2xx: 0, total4xx: 0, total5xx: 0 };
  state.routeStats.clear();
  state.startTime = Date.now();
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}
