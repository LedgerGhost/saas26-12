const express = require('express');
const cors = require('cors');
const { userFromGatewayHeaders } = require('@saasplug/shared-utils');

module.exports = function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(userFromGatewayHeaders);

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'stations-service' }));
  app.use('/api/stations', require('./routes/stations'));

  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', path: req.originalUrl }));
  app.use((err, _req, res, _next) => {
    console.error('[stations-service]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  });
  return app;
};
