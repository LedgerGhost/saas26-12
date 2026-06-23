const express = require('express');
const axios = require('axios');
const { logger, ValkeyCache } = require('@saasplug/shared-utils');

const log = logger('provider-orchestrator');

const CACHE_TTL = 30;     // seconds
const DAILY_MS  = 86_400_000;
const WARMUP_DELAY_MS = 3_000; // let adapter warmups finish

const ADAPTERS = {
  redPlug:   () => process.env.REDPLUG_URL,
  greenPlug: () => process.env.GREENPLUG_URL,
  bluePlug:  () => process.env.BLUEPLUG_URL
};

module.exports = function buildApp() {
  const app = express();
  app.use(express.json());

  const cache = new ValkeyCache(process.env.VALKEY_URL, 'orchestrator');

  async function refreshCaches(status) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const results = await Promise.allSettled(
      Object.entries(ADAPTERS).map(async ([id, urlFn]) => {
        const r = await axios.get(`${urlFn()}/stations${qs}`, { timeout: 8000 });
        return { providerId: id, data: r.data };
      })
    );

    const stations = [];
    const errors = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        stations.push(...(Array.isArray(r.value.data) ? r.value.data : []));
      } else {
        log.warn(`adapter failed: ${r.reason?.message}`);
        errors.push(r.reason?.message || 'unknown');
      }
    }

    const result = { stations, partial: errors.length > 0, errors };

    const cacheKey = status ? `stations:status:${status}` : 'stations';
    if (errors.length === 0) {
      await cache.set(cacheKey, result, CACHE_TTL);
    }

    return result;
  }

  // startup warmup — delay to let adapters finish their own warmups
  (async () => {
    await new Promise(r => setTimeout(r, WARMUP_DELAY_MS));
    try {
      const r = await refreshCaches();
      log.info(`warmup: cached ${r.stations.length} stations`);
    } catch (err) {
      log.warn(`warmup failed: ${err.message}`);
    }
  })();

  // daily refresh
  setInterval(async () => {
    try {
      const r = await refreshCaches();
      log.info(`daily refresh: cached ${r.stations.length} stations`);
    } catch (err) {
      log.warn(`daily refresh failed: ${err.message}`);
    }
  }, DAILY_MS);

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'provider-orchestrator', adapters: Object.keys(ADAPTERS) }));

  /**
   * GET /connectors
   * Pings each adapter's /health and reports reachability + upstream API base URL.
   * Used by the provider-registration service to discover connectors for registration.
   */
  app.get('/connectors', async (_req, res) => {
    const entries = Object.entries(ADAPTERS);
    const results = await Promise.allSettled(
      entries.map(async ([id, urlFn]) => {
        const url = urlFn();
        if (!url) throw new Error('adapter URL not configured');
        const r = await axios.get(`${url}/health`, { timeout: 5_000 });
        return {
          providerSystemId: id,
          apiBaseUrl: r.data.base || null,
          reachable: true
        };
      })
    );
    const connectors = results.map((r, i) => {
      const id = entries[i][0];
      if (r.status === 'fulfilled') return r.value;
      return { providerSystemId: id, apiBaseUrl: null, reachable: false, error: r.reason?.message };
    });
    res.json({ connectors });
  });

  /**
   * GET /stations[?status=...]
   * Fans out to all adapters in parallel. Cached 30s.
   */
  app.get('/stations', async (req, res) => {
    try {
      const status = req.query.status;
      const cacheKey = status ? `stations:status:${status}` : 'stations';

      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const result = await refreshCaches(status);
      res.json(result);
    } catch (err) {
      log.error(`/stations failed: ${err.message}`);
      res.status(502).json({ error: 'ORCH_ERROR', message: err.message });
    }
  });

  /** GET /stations/:stationId  — always passes through to adapter */
  app.get('/stations/:stationId', async (req, res) => {
    try {
      const { providerId, externalId } = parseStationId(req.params.stationId);
      const url = `${ADAPTERS[providerId]()}/stations/${encodeURIComponent(externalId)}`;
      const r = await axios.get(url, { timeout: 8000 });
      res.json(r.data);
    } catch (err) {
      const status = err.response?.status === 404 ? 404 : 502;
      res.status(status).json({ error: status === 404 ? 'STATION_NOT_FOUND' : 'ORCH_ERROR', message: err.message });
    }
  });

  /** POST /stations/:stationId/reserve   body: { minutes } */
  app.post('/stations/:stationId/reserve', async (req, res) => {
    try {
      const stationId = req.params.stationId;
      const { providerId, externalId } = parseStationId(stationId);
      const url = `${ADAPTERS[providerId]()}/stations/${encodeURIComponent(externalId)}/reserve`;
      const r = await axios.post(url, { minutes: req.body?.minutes }, { timeout: 10_000 });

      if (r.data?.confirmed) {
        await cache.del('stations');
      }

      res.json(r.data);
    } catch (err) {
      res.status(502).json({ error: 'ORCH_ERROR', message: err.message });
    }
  });

  return app;
};

function parseStationId(s) {
  const idx = String(s).indexOf(':');
  if (idx < 0) throw new Error('Invalid stationId — expected "<providerId>:<externalId>"');
  const providerId = s.slice(0, idx);
  const externalId = s.slice(idx + 1);
  if (!ADAPTERS[providerId]) throw new Error(`Unknown providerId "${providerId}"`);
  return { providerId, externalId };
}
