const express = require('express');
const axios = require('axios');
const { toInternalStatus, logger, ValkeyCache } = require('@saasplug/shared-utils');

const log = logger(`${process.env.PROVIDER_ID || 'provider'}-service`);

const DYNAMIC_TTL = 30;     // seconds — dynamic fields (status) refresh every 30s
const DAILY_MS    = 86_400_000; // milliseconds — static data refreshed once per day

module.exports = function buildApp() {
  const app = express();
  app.use(express.json());

  const PROVIDER_ID  = process.env.PROVIDER_ID;
  const API_BASE_URL = process.env.PROVIDER_API_BASE_URL;
  const API_KEY      = process.env.PROVIDER_API_KEY;

  const cache = new ValkeyCache(process.env.VALKEY_URL, PROVIDER_ID);

  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10_000,
    headers: API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}
  });

  /**
   * Fetch stations from the upstream provider and populate both caches.
   * Returns { stations, dynamic } or throws if the provider is unreachable.
   */
  async function refreshCaches() {
    const upstream = await client.get('/points');
    const arr = Array.isArray(upstream.data) ? upstream.data : [];

    const dynamic = {};
    for (const p of arr) {
      dynamic[String(p.pointid)] = { status: toInternalStatus(p.status) };
    }
    const stations = arr.map(p => toStationDTO(p, PROVIDER_ID));

    await Promise.all([
      cache.set('dynamic', dynamic, DYNAMIC_TTL),
      cache.set('stations', stations)
    ]);

    return { stations, dynamic };
  }

  // ── startup warmup (non-blocking) ──
  (async () => {
    try {
      const r = await refreshCaches();
      log.info(`warmup: cached ${r.stations.length} stations`);
    } catch (err) {
      log.warn(`warmup failed (provider unreachable, will retry on first request): ${err.message}`);
    }
  })();

  // ── daily refresh ──
  setInterval(async () => {
    try {
      const r = await refreshCaches();
      log.info(`daily refresh: cached ${r.stations.length} stations`);
    } catch (err) {
      log.warn(`daily refresh failed: ${err.message}`);
    }
  }, DAILY_MS);

  app.get('/health', (_req, res) => res.json({ status: 'ok', providerId: PROVIDER_ID, base: API_BASE_URL }));

  // GET /stations  →  list of StationDTO
  // Static fields (name, location, capacity, connector) cached 1 day.
  // Dynamic fields (status) refreshed every 30s.
  // Falls back to cached data if the provider is unreachable.
  app.get('/stations', async (req, res) => {
    try {
      let stations = await cache.get('stations');
      let dynamic = await cache.get('dynamic');

      if (!dynamic) {
        try {
          const r = await refreshCaches();
          stations = r.stations;
          dynamic = r.dynamic;
        } catch (fetchErr) {
          log.warn(`provider unreachable, falling back to cache: ${fetchErr.message}`);
          if (!stations) {
            return res.status(502).json({ error: 'PROVIDER_UNREACHABLE', providerId: PROVIDER_ID, message: fetchErr.message });
          }
          return res.json(stations);
        }
      }

      if (!stations) {
        try {
          const r = await refreshCaches();
          stations = r.stations;
          dynamic = r.dynamic;
        } catch (fetchErr) {
          return res.status(502).json({ error: 'PROVIDER_UNREACHABLE', providerId: PROVIDER_ID, message: fetchErr.message });
        }
      }

      const result = stations.map(s => {
        const d = dynamic[s.externalStationId];
        return { ...s, status: d?.status ?? s.status, lastUpdatedAt: new Date().toISOString() };
      });

      res.json(result);
    } catch (err) {
      log.error(`/stations failed: ${err.message}`);
      res.status(502).json({ error: 'PROVIDER_UNREACHABLE', providerId: PROVIDER_ID, message: err.message });
    }
  });

  // GET /stations/:externalId  →  StationDetailDTO  — always fresh from provider
  app.get('/stations/:externalId', async (req, res) => {
    try {
      const upstream = await client.get(`/point/${encodeURIComponent(req.params.externalId)}`);
      res.json(toStationDetailDTO(upstream.data, PROVIDER_ID));
    } catch (err) {
      const status = err.response?.status === 404 ? 404 : 502;
      res.status(status).json({ error: status === 404 ? 'STATION_NOT_FOUND' : 'PROVIDER_UNREACHABLE', message: err.message });
    }
  });

  // POST /stations/:externalId/reserve   body: { minutes }
  app.post('/stations/:externalId/reserve', async (req, res) => {
    try {
      const externalId = req.params.externalId;
      const minutes = clampMinutes(req.body?.minutes);
      const url = `/reserve/${encodeURIComponent(externalId)}/${minutes}`;
      const upstream = await client.post(url);
      const body = upstream.data || {};

      const confirmed = String(body.status).toLowerCase() === 'reserved'
                     && body.reservationendtime
                     && !String(body.reservationendtime).startsWith('1970');

      if (confirmed) {
        await Promise.all([
          cache.del('stations'),
          cache.del('dynamic'),
          cache.del(`station:${externalId}`)
        ]);
      }

      res.json({
        confirmed,
        providerId: PROVIDER_ID,
        externalStationId: String(body.pointid),
        newStatus: toInternalStatus(body.status),
        endTime: confirmed ? parseTimestamp(body.reservationendtime) : null,
        chargeAmount: confirmed ? 0.50 : 0,
        currency: 'EUR'
      });
    } catch (err) {
      log.error(`/reserve failed: ${err.message}`);
      res.status(502).json({ error: 'PROVIDER_UNREACHABLE', message: err.message });
    }
  });

  return app;
};

// ---------- mappers ----------

function toStationDTO(p, providerId) {
  return {
    stationId:        `${providerId}:${p.pointid}`,
    providerId,
    externalStationId: String(p.pointid),
    name:             p.locationName || `${providerId} #${p.pointid}`,
    latitude:         parseFloat(p.lat),
    longitude:        parseFloat(p.long),
    status:           toInternalStatus(p.status),
    pricePerKwh:      null,
    capacityKw:       p.cap ?? null,
    connector:        p.connector ?? null,
    lastUpdatedAt:    new Date().toISOString()
  };
}

function toStationDetailDTO(p, providerId) {
  const dto = toStationDTO(p, providerId);
  return { ...dto, reservationEndTime: p.reservationendtime ? parseTimestamp(p.reservationendtime) : null };
}

function clampMinutes(v) {
  return Math.min(60, Math.max(1, parseInt(v, 10) || 30));
}

function parseTimestamp(s) {
  if (!s || typeof s !== 'string') return null;
  const iso = s.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
