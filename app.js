'use strict';

const express = require('express');
const client  = require('prom-client');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name      : 'http_requests_total',
  help      : 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers : [register],
});

const httpRequestDuration = new client.Histogram({
  name      : 'http_request_duration_seconds',
  help      : 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets   : [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers : [register],
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status_code: res.statusCode };
    httpRequestCounter.inc(labels);
    end(labels);
  });
  next();
});

app.get('/', (_req, res) => {
  res.send('Hello from DevOps Assignment');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;
