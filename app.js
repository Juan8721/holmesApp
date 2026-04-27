'use strict';

const express = require('express');
const client = require('prom-client');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CHAOS_MODE = process.env.CHAOS_MODE || 'none';
const CHAOS_TOKEN = process.env.CHAOS_TOKEN || 'workshop2024';

// ─── Prometheus metrics ────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const processMemoryHeapBytes = new client.Gauge({
  name: 'process_memory_heap_bytes',
  help: 'Current heap memory usage in bytes',
  registers: [register],
  collect() {
    this.set(process.memoryUsage().heapUsed);
  },
});

// ─── Structured JSON logger ────────────────────────────────────────────────
function log(level, message, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    chaos_mode: CHAOS_MODE,
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// ─── Metrics middleware ────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route ? req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationMs);
    log('info', 'request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_seconds: durationMs,
    });
  });
  next();
});

// ─── Chaos: memory leak ────────────────────────────────────────────────────
let memoryLeakArray = [];
let memoryLeakInterval = null;

function startMemoryLeak() {
  log('warn', 'CHAOS memory leak started – growing 10 MB every 5 seconds with memory limit protection');
  memoryLeakInterval = setInterval(() => {
    // Check current memory usage before allocating
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const maxMemoryMB = 400; // Stay well below 512Mi limit
    
    if (heapUsedMB >= maxMemoryMB) {
      log('warn', 'memory leak stopped - approaching memory limit', {
        heap_used_mb: Math.round(heapUsedMB),
        max_memory_mb: maxMemoryMB,
        total_chunks: memoryLeakArray.length,
      });
      stopMemoryLeak();
      return;
    }
    
    // Allocate smaller chunks (10 MB instead of 50 MB) with longer intervals
    const chunk = Buffer.alloc(10 * 1024 * 1024, 'x');
    memoryLeakArray.push(chunk);
    log('warn', 'memory leak chunk added', {
      total_chunks: memoryLeakArray.length,
      heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  }, 5000); // Increased interval from 2s to 5s
}

function stopMemoryLeak() {
  if (memoryLeakInterval) {
    clearInterval(memoryLeakInterval);
    memoryLeakInterval = null;
  }
  memoryLeakArray = [];
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  log('info', 'memory leak stopped and memory cleared');
}

// ─── Active chaos mode at startup ─────────────────────────────────────────
log('info', 'application starting', { port: PORT, chaos_mode: CHAOS_MODE });

if (CHAOS_MODE === 'crash') {
  log('error', 'CHAOS crash mode – calling process.exit(1)');
  process.exit(1);
}

if (CHAOS_MODE === 'memory') {
  startMemoryLeak();
}

// ─── Routes ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'demo-app',
    version: '1.0.1', // Updated version
    chaos_mode: CHAOS_MODE,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    chaos_mode: CHAOS_MODE,
    uptime_seconds: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
  });
});

app.get('/api/items', (req, res) => {
  // Chaos: errors mode – 80% chance of returning 500
  if (CHAOS_MODE === 'errors' && Math.random() < 0.8) {
    log('error', 'CHAOS errors mode – returning 500');
    return res.status(500).json({
      error: 'Internal Server Error',
      chaos_mode: CHAOS_MODE,
      message: 'Simulated error injected by chaos mode',
    });
  }

  const items = [
    { id: 1, name: 'Widget Alpha', price: 9.99, stock: 42 },
    { id: 2, name: 'Gadget Beta', price: 24.99, stock: 17 },
    { id: 3, name: 'Device Gamma', price: 49.99, stock: 5 },
    { id: 4, name: 'Tool Delta', price: 14.99, stock: 100 },
    { id: 5, name: 'Module Epsilon', price: 7.50, stock: 250 },
  ];

  res.json({ items, total: items.length, chaos_mode: CHAOS_MODE });
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    log('error', 'failed to collect metrics', { error: err.message });
    res.status(500).end(err.message);
  }
});

app.post('/api/chaos', (req, res) => {
  const token = req.headers['x-chaos-token'];
  if (!token || token !== CHAOS_TOKEN) {
    log('warn', 'chaos endpoint called with invalid token');
    return res.status(401).json({ error: 'Unauthorized – invalid X-Chaos-Token' });
  }

  const { mode } = req.body;
  const validModes = ['none', 'memory', 'errors', 'crash'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({
      error: `Invalid mode. Allowed: ${validModes.join(', ')}`,
    });
  }

  // Stop any active memory leak before switching modes
  stopMemoryLeak();

  // Update environment variable for subsequent logic
  process.env.CHAOS_MODE = mode;
  // Re-read after update so the module-level variable is not stale
  const newMode = process.env.CHAOS_MODE;

  if (newMode === 'crash') {
    log('error', 'CHAOS crash triggered via API – calling process.exit(1)');
    res.json({ message: 'Crash initiated' });
    setTimeout(() => process.exit(1), 100);
    return;
  }

  if (newMode === 'memory') {
    startMemoryLeak();
  }

  log('info', 'chaos mode changed via API', { previous: CHAOS_MODE, new: newMode });
  res.json({ message: `Chaos mode set to: ${newMode}`, mode: newMode });
});

// ─── 404 handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// ─── Global error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  log('error', 'unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

// ─── Start server ─────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  log('info', 'server listening', { port: PORT });
});

module.exports = app;