const express = require('express');
const cors = require('cors');

module.exports = function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));
  app.use('/api/auth', require('./routes/auth'));

  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', path: req.originalUrl }));
  app.use((err, _req, res, _next) => {
    console.error('[auth-service]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  });
  return app;
};
