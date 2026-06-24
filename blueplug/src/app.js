const express = require('express');
const axios = require('axios');
const {
  STATION_STATUSES,
  normalizeStationStatus,
  logger,
  ValkeyCache
} = require('@saasplug/shared-utils');

const log = logger(`${process.env.PROVIDER_ID || 'provider'}-service`);

const DYNAMIC_TTL = 30;
const DAILY_MS    = 86_400_000;

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

  async function refreshCaches() {
    const upstream = await client.get('/locations');
    const arr = Array.isArray(upstream.data) ? upstream.data : [];

    const dynamic = {};
    for (const p of arr) {
      dynamic[String(p.chargerId)] = {
        status: normalizeStationStatus(p.currentStatus),
        pricePerKwh: p.pricePerKwh ?? null
      };
    }
    const stations = arr.map(p => toStationDTO(p, PROVIDER_ID));

    await Promise.all([
      cache.set('dynamic', dynamic, DYNAMIC_TTL),
      cache.set('stations', stations)
    ]);

    return { stations, dynamic };
  }

  // startup warmup
  (async () => {
    try {
      const r = await refreshCaches();
      log.info(`warmup: cached ${r.stations.length} stations`);
    } catch (err) {
      log.warn(`warmup failed (provider unreachable, will retry on first request): ${err.message}`);
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

  app.get('/health', (_req, res) => res.json({ status: 'ok', providerId: PROVIDER_ID, base: API_BASE_URL }));

  app.get('/stations', async (req, res) => {
    try {
      const requestedStatus = req.query.status
        ? normalizeStationStatus(req.query.status, null)
        : null;
      if (req.query.status && !requestedStatus) {
        return res.status(400).json({ error: 'INVALID_STATUS', validStatuses: STATION_STATUSES });
      }

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
          const fallback = stations.map(s => ({ ...s, status: normalizeStationStatus(s.status) }));
          return res.json(requestedStatus ? fallback.filter(s => s.status === requestedStatus) : fallback);
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
        return {
          ...s,
          status: normalizeStationStatus(d?.status ?? s.status),
          pricePerKwh: d?.pricePerKwh ?? s.pricePerKwh,
          lastUpdatedAt: new Date().toISOString()
        };
      });

      res.json(requestedStatus ? result.filter(s => s.status === requestedStatus) : result);
    } catch (err) {
      log.error(`/stations failed: ${err.message}`);
      res.status(502).json({ error: 'PROVIDER_UNREACHABLE', providerId: PROVIDER_ID, message: err.message });
    }
  });

  app.get('/stations/:externalId', async (req, res) => {
    try {
      const upstream = await client.get(`/location/${encodeURIComponent(req.params.externalId)}/status`);
      res.json(toStationDetailDTO(upstream.data, PROVIDER_ID));
    } catch (err) {
      const status = err.response?.status === 404 ? 404 : 502;
      res.status(status).json({ error: status === 404 ? 'STATION_NOT_FOUND' : 'PROVIDER_UNREACHABLE', message: err.message });
    }
  });

  app.post('/stations/:externalId/reserve', async (req, res) => {
    try {
      const externalId = req.params.externalId;
      const minutes = clampMinutes(req.body?.minutes);
      const url = `/location/${encodeURIComponent(externalId)}/hold`;
      const upstream = await client.post(url, null, { params: { minutes } });
      const body = upstream.data || {};

      const confirmed = String(body.currentStatus).toLowerCase() === 'reserved'
                     && body.reservationEnd
                     && !String(body.reservationEnd).startsWith('1970');

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
        externalStationId: String(body.chargerId),
        newStatus: normalizeStationStatus(body.currentStatus),
        endTime: confirmed ? parseTimestamp(body.reservationEnd) : null,
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
    stationId:        `${providerId}:${p.chargerId}`,
    providerId,
    externalStationId: String(p.chargerId),
    name:             p.locationName || `${providerId} #${p.chargerId}`,
    latitude:         p.geo?.[1] != null ? parseFloat(p.geo[1]) : null,
    longitude:        p.geo?.[0] != null ? parseFloat(p.geo[0]) : null,
    status:           normalizeStationStatus(p.currentStatus),
    pricePerKwh:      p.pricePerKwh ?? null,
    capacityKw:       p.cap ?? null,
    connector:        null,
    lastUpdatedAt:    new Date().toISOString()
  };
}

function toStationDetailDTO(p, providerId) {
  const dto = toStationDTO(p, providerId);
  return { ...dto, reservationEndTime: p.reservationEnd ? parseTimestamp(p.reservationEnd) : null };
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
