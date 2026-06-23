const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { verifyToken, logger } = require('@saasplug/shared-utils');

const log = logger('api-gateway');

const ROUTES = [
  { prefix: '/api/auth/users',   target: () => process.env.AUTH_SERVICE_URL,         protected: true  }, // operator user-management — must precede /api/auth
  { prefix: '/api/auth',         target: () => process.env.AUTH_SERVICE_URL,         protected: false },
  { prefix: '/api/stations',     target: () => process.env.STATIONS_SERVICE_URL,     protected: false }, // search is public
  { prefix: '/api/reservations', target: () => process.env.RESERVATION_SERVICE_URL,  protected: true  },
  { prefix: '/api/providers',    target: () => process.env.PROVIDER_SERVICE_URL,     protected: false },
  { prefix: '/api/invoices',     target: () => process.env.BILLING_SERVICE_URL,      protected: true  },
  { prefix: '/api/analytics',    target: () => process.env.ANALYTICS_SERVICE_URL,    protected: true  }
];

module.exports = async function buildApp() {
  const app = express();
  app.use(cors());
  // If the path is our specific webhook, skip to the next middleware (proxy)
  // Otherwise, run the JSON parser.
  const jsonParser = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    // Use includes() so it catches '/api/invoices/webhooks/stripe' or similar variations
    if (req.path.includes('/webhook')) {
      next(); 
    } else {
      jsonParser(req, res, next);
    }
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

  // Rate limit per IP — defaults to 300 requests per 5 minutes. /health is excluded above.
  const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000),
    max:      Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many requests, slow down.' }
  });
  app.use('/api/', limiter);

  for (const route of ROUTES) {
    app.use(route.prefix, makeProxy(route));
  }

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  return app;
};

function makeProxy(route) {
  return async (req, res) => {
    // Auth check
    let user = null;
    if (route.protected) {
      const header = req.headers.authorization || '';
      const [scheme, token] = header.split(' ');
      if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'UNAUTHENTICATED' });
      }
      try {
        const payload = verifyToken(token);
        user = { id: payload.sub, email: payload.email, role: payload.role };
      } catch (err) {
        return res.status(401).json({ error: 'INVALID_TOKEN', message: err.message });
      }
    } else if (req.headers.authorization) {
      // Optional auth — pass user info downstream if a valid token is present
      try {
        const [, token] = req.headers.authorization.split(' ');
        const payload = verifyToken(token);
        user = { id: payload.sub, email: payload.email, role: payload.role };
      } catch { /* ignore — public endpoint */ }
    }

    const target = `${route.target()}${req.originalUrl}`;
    const headers = { 'content-type': req.headers['content-type'] || 'application/json' };
    // Pass through the Authorization header so endpoints that re-verify (e.g. /auth/me) keep working
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (user) {
      headers['x-user-id'] = user.id;
      headers['x-user-email'] = user.email || '';
      headers['x-user-role'] = user.role || '';
    }

    try {
      const upstream = await axios({
        method: req.method,
        url: target,
        headers,
        data: req.body,
        params: undefined, // already in originalUrl
        validateStatus: () => true,
        timeout: 30_000
      });
      res.status(upstream.status).set(filterRespHeaders(upstream.headers)).send(upstream.data);
    } catch (err) {
      log.error(`upstream error ${route.prefix} -> ${target}: ${err.message}`);
      res.status(502).json({ error: 'BAD_GATEWAY', message: err.message });
    }
  };
}

function filterRespHeaders(h) {
  // strip hop-by-hop + length headers
  const drop = ['content-length', 'connection', 'transfer-encoding'];
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (!drop.includes(k.toLowerCase())) out[k] = v;
  }
  return out;
}
