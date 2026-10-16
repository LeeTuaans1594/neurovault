/**
 * NEUROVAULT — Monitoring Routes
 * Admin-only endpoints for system observability:
 * - /api/monitor/metrics — Real-time system metrics
 * - /api/monitor/timeseries — Chart data (RPM, latency, errors over time)
 * - /api/monitor/audit — Security audit log
 * - /api/monitor/cache — Response cache stats
 * - /api/monitor/errors — Recent error log
 */
import { Router } from 'express';
import auth from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import { getMetrics, getTimeSeries } from '../services/metrics.service.js';
import { getAuditLog } from '../middleware/security.js';
import { getCacheStats } from '../middleware/responseCache.js';
import mongoose from 'mongoose';

const router = Router();

// All monitoring routes require admin or instructor role
const requireMonitor = requireRole('instructor', 'admin');

/**
 * GET /api/monitor/metrics
 * Full system metrics snapshot.
 */
router.get('/metrics', auth, requireMonitor, (req, res) => {
  const metrics = getMetrics();
  res.json(metrics);
});

/**
 * GET /api/monitor/timeseries?minutes=30
 * Time-series data for dashboard charts.
 */
router.get('/timeseries', auth, requireMonitor, (req, res) => {
  const minutes = Math.min(60, Math.max(5, parseInt(req.query.minutes) || 30));
  const data = getTimeSeries(minutes);
  res.json({ minutes, data });
});

/**
 * GET /api/monitor/audit?limit=50
 * Security audit log.
 */
router.get('/audit', auth, requireMonitor, (req, res) => {
  const limit = Math.min(200, Math.max(10, parseInt(req.query.limit) || 50));
  const log = getAuditLog(limit);
  res.json({ total: log.length, entries: log });
});

/**
 * GET /api/monitor/cache
 * Response cache statistics.
 */
router.get('/cache', auth, requireMonitor, (req, res) => {
  const stats = getCacheStats();
  res.json(stats);
});

/**
 * GET /api/monitor/database
 * MongoDB connection and collection stats.
 */
router.get('/database', auth, requireMonitor, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.json({ status: 'disconnected', collections: [] });
    }

    const collections = await db.listCollections().toArray();
    const collectionStats = await Promise.all(
      collections.map(async (col) => {
        try {
          const stats = await db.collection(col.name).estimatedDocumentCount();
          return { name: col.name, count: stats };
        } catch {
          return { name: col.name, count: '?' };
        }
      })
    );

    res.json({
      status: 'connected',
      host: mongoose.connection.host,
      dbName: mongoose.connection.name,
      readyState: mongoose.connection.readyState,
      collections: collectionStats.sort((a, b) => (b.count || 0) - (a.count || 0)),
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/monitor/overview
 * Consolidated dashboard overview (single request for all monitoring data).
 */
router.get('/overview', auth, requireMonitor, async (req, res, next) => {
  try {
    const metrics = getMetrics();
    const timeseries = getTimeSeries(15);
    const cache = getCacheStats();
    const audit = getAuditLog(10);

    // DB summary
    let dbSummary = { status: 'unknown', collections: 0 };
    try {
      const db = mongoose.connection.db;
      if (db) {
        const cols = await db.listCollections().toArray();
        dbSummary = {
          status: 'connected',
          collections: cols.length,
          dbName: mongoose.connection.name,
        };
      }
    } catch { /* */ }

    res.json({
      system: metrics.system,
      throughput: metrics.throughput,
      latency: metrics.latency,
      errors: metrics.errors,
      memory: metrics.memory,
      topRoutes: metrics.routes.slice(0, 10),
      timeseries,
      cache,
      database: dbSummary,
      recentAudit: audit,
    });
  } catch (err) { next(err); }
});

export default router;
