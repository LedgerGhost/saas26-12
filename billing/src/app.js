const express = require('express');
const cors = require('cors');
const { userFromGatewayHeaders } = require('@saasplug/shared-utils');

module.exports = function buildApp() {
  const app = express();
  app.use(cors());
  app.use(userFromGatewayHeaders);

  const jsonParser = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    // Use includes() so it catches '/api/invoices/webhooks/stripe' or similar variations
    if (req.path.includes('/webhook')) {
      next(); 
    } else {
      jsonParser(req, res, next);
    }
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'billing-service' }));
  app.use('/api/invoices', require('./routes/invoices'));

  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', path: req.originalUrl }));
  app.use((err, _req, res, _next) => {
    console.error('[billing-service]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  });
  return app;
};
