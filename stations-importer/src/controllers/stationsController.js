const axios = require('axios');
const StationCache = require('../models/StationCache');
const {
  STATION_STATUSES,
  normalizeStationStatus,
  stationStatusQueryValues,
  publish,
  logger
} = require('@saasplug/shared-utils');

const log = logger('stations-service');
const ORCH = () => process.env.ORCHESTRATOR_URL;
const PROVIDERS = () => process.env.PROVIDER_SERVICE_URL;
const CACHE_TTL_MS = (parseInt(process.env.STATIONS_CACHE_TTL_SEC, 10) || 300) * 1000;

/**
 * GET /api/stations?lat&lng&radius&status&providerId
 * Strategy:
 *   1. If cache for these filters is younger than TTL → return cache.
 *   2. Otherwise call orchestrator (parallel fan-out), refresh cache, return result.
 * Filters are applied AFTER fan-out so we always have a complete picture in cache.
 */
exports.searchStations = async (req, res) => {
  const { lat, lng, radius, status, providerId, q, name } = req.query;
  const normalizedStatus = status ? normalizeStationStatus(status, null) : null;
  const t0 = Date.now();

  try {
    if (status && !normalizedStatus) {
      return res.status(400).json({ error: 'INVALID_STATUS', validStatuses: STATION_STATUSES });
    }

    // Decide cache freshness — we treat the cache as a single global pool
    const freshDoc = await StationCache.findOne({ providerManaged: { $ne: true } }).sort({ lastSyncedAt: -1 }).lean();
    const stale = !freshDoc || (Date.now() - new Date(freshDoc.lastSyncedAt).getTime() > CACHE_TTL_MS);

    if (stale) {
      log.info('cache stale → fetching from orchestrator');
      try {
        const upstream = await axios.get(`${ORCH()}/stations`, { timeout: 12_000 });
        const stations = upstream.data?.stations || [];
        // Upsert into cache
        await Promise.all(stations.map(upsertOrchestratorStation));
      } catch (err) {
        // Orchestrator unreachable — serve from stale cache if we have it
        log.warn(`orchestrator unreachable, serving stale cache: ${err.message}`);
        if (!freshDoc) {
          return res.status(502).json({ error: 'SEARCH_FAILED', message: 'Backend unreachable and no cached data available' });
        }
        // fall through to serve stale cache below
      }
    }

    // Apply filters server-side
    const query = { providerManaged: { $ne: true } };
    if (providerId) query.providerId = providerId;
    if (normalizedStatus) query.status = { $in: stationStatusQueryValues(normalizedStatus) };

    // Case-insensitive substring search on the station name (or stationId as a fallback).
    // Accept either ?q= (preferred, generic) or ?name= for clarity.
    const term = (q || name || '').toString().trim();
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name:      { $regex: safe, $options: 'i' } },
        { stationId: { $regex: safe, $options: 'i' } }
      ];
    }

    let docs;
    if (lat && lng && radius) {
      const latN = parseFloat(lat), lngN = parseFloat(lng), rKm = parseFloat(radius);
      // simple bounding-box (1 deg lat ≈ 111 km)
      const deltaLat = rKm / 111;
      const deltaLng = rKm / (111 * Math.cos(latN * Math.PI / 180));
      query.latitude  = { $gte: latN - deltaLat, $lte: latN + deltaLat };
      query.longitude = { $gte: lngN - deltaLng, $lte: lngN + deltaLng };
    }

    docs = await StationCache.find(query).lean();

    const providerCounts = docs.reduce((acc, station) => {
      acc[station.providerId] = (acc[station.providerId] || 0) + 1;
      return acc;
    }, {});

    // Publish SearchPerformed event (fire-and-forget). Broad searches are
    // expanded by analytics-service into provider-scoped entries.
    publish('station.searched', {
      userId: req.user?.id || null,
      providerId: providerId || null,
      filters: { lat, lng, radius, status: normalizedStatus, providerId, q: term || null },
      providerCounts,
      resultCount: docs.length,
      ts: new Date().toISOString()
    }).catch(e => log.warn(`publish failed: ${e.message}`));

    res.json({
      stations: docs.map(toDTO),
      meta: {
        count: docs.length,
        servedFrom: stale ? 'fresh-fetch' : 'cache',
        durationMs: Date.now() - t0
      }
    });
  } catch (err) {
    log.error(`search failed: ${err.message}`);
    res.status(502).json({ error: 'SEARCH_FAILED', message: err.message });
  }
};

/**
 * GET /api/stations/:stationId
 * Always fetches fresh from orchestrator (for status/reservation-end accuracy).
 * Publishes a click event.
 */
exports.getStationDetail = async (req, res) => {
  try {
    const upstream = await axios.get(`${ORCH()}/stations/${encodeURIComponent(req.params.stationId)}`, { timeout: 8000 });
    const detail = upstream.data;
    const existing = await StationCache.findOne({ stationId: detail.stationId || req.params.stationId })
      .select('manualStatus status')
      .lean();
    const status = existing?.manualStatus
      ? normalizeStationStatus(existing.status)
      : normalizeStationStatus(detail.status);

    // Update cache opportunistically
    await StationCache.findOneAndUpdate(
      { stationId: detail.stationId },
      { status, pricePerKwh: detail.pricePerKwh, lastSyncedAt: new Date() },
      { upsert: false }
    );

    publish('station.clicked', {
      userId: req.user?.id || null,
      stationId: detail.stationId,
      providerId: detail.providerId,
      ts: new Date().toISOString()
    }).catch(e => log.warn(`publish click failed: ${e.message}`));

    res.json({ ...detail, status });
  } catch (err) {
    const status = err.response?.status === 404 ? 404 : 502;
    res.status(status).json({
      error: status === 404 ? 'STATION_NOT_FOUND' : 'DETAIL_FAILED',
      message: err.message
    });
  }
};

/**
 * GET /api/stations/provider/mine
 * Provider-only station list. Includes upstream-cached stations for the linked
 * provider.
 */
exports.listProviderStations = async (req, res) => {
  try {
    const provider = await resolveProviderForUser(req);
    if (provider.error) return res.status(provider.status).json(provider.error);

    await refreshCacheIfStale();

    const docs = await StationCache.find({
      providerId: provider.providerSystemId,
      providerManaged: { $ne: true }
    })
      .sort({ name: 1, stationId: 1 })
      .lean();

    res.json({
      provider,
      stations: docs.map(toDTO),
      meta: { count: docs.length }
    });
  } catch (err) {
    log.error(`provider station list failed: ${err.message}`);
    res.status(502).json({ error: 'PROVIDER_STATIONS_FAILED', message: err.message });
  }
};

/**
 * PATCH /api/stations/provider/:stationId/status
 * Provider-only local status override for one of the provider's stations.
 */
exports.updateProviderStationStatus = async (req, res) => {
  try {
    const provider = await resolveProviderForUser(req);
    if (provider.error) return res.status(provider.status).json(provider.error);

    const normalizedStatus = normalizeStationStatus(req.body?.status, null);
    if (!normalizedStatus) {
      return res.status(400).json({ error: 'INVALID_STATUS', validStatuses: STATION_STATUSES });
    }

    const stationId = req.params.stationId;
    const station = await StationCache.findOne({ stationId });
    if (!station || station.providerManaged) {
      return res.status(404).json({ error: 'STATION_NOT_FOUND', message: 'Station not found in cache.' });
    }
    if (station.providerId !== provider.providerSystemId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Providers can only manage their own stations.' });
    }

    station.status = normalizedStatus;
    station.manualStatus = true;
    station.lastSyncedAt = new Date();
    await station.save();

    res.json(toDTO(station));
  } catch (err) {
    log.error(`provider station status update failed: ${err.message}`);
    res.status(500).json({ error: 'STATUS_UPDATE_FAILED', message: err.message });
  }
};

function toDTO(d) {
  return {
    stationId: d.stationId,
    providerId: d.providerId,
    externalStationId: d.externalStationId,
    name: d.name,
    latitude: d.latitude,
    longitude: d.longitude,
    status: normalizeStationStatus(d.status),
    pricePerKwh: d.pricePerKwh,
    capacityKw: d.capacityKw,
    connector: d.connector,
    lastUpdatedAt: d.lastSyncedAt
  };
}

async function refreshCacheIfStale() {
  const freshDoc = await StationCache.findOne({ providerManaged: { $ne: true } }).sort({ lastSyncedAt: -1 }).lean();
  const stale = !freshDoc || (Date.now() - new Date(freshDoc.lastSyncedAt).getTime() > CACHE_TTL_MS);
  if (!stale) return;

  try {
    const upstream = await axios.get(`${ORCH()}/stations`, { timeout: 12_000 });
    const stations = upstream.data?.stations || [];
    await Promise.all(stations.map(upsertOrchestratorStation));
  } catch (err) {
    log.warn(`provider station cache refresh failed, using local cache: ${err.message}`);
  }
}

async function upsertOrchestratorStation(s) {
  const existing = await StationCache.findOne({ stationId: s.stationId }).select('manualStatus status').lean();
  await StationCache.findOneAndUpdate(
    { stationId: s.stationId },
    {
      stationId: s.stationId,
      providerId: s.providerId,
      externalStationId: s.externalStationId,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      status: existing?.manualStatus ? existing.status : normalizeStationStatus(s.status),
      pricePerKwh: s.pricePerKwh,
      capacityKw: s.capacityKw,
      connector: s.connector,
      providerManaged: false,
      lastSyncedAt: new Date(s.lastUpdatedAt || Date.now())
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function resolveProviderForUser(req) {
  if (req.user?.role !== 'provider') {
    return {
      status: 403,
      error: { error: 'FORBIDDEN', message: 'provider role required' }
    };
  }
  if (!PROVIDERS()) {
    return {
      status: 503,
      error: { error: 'PROVIDER_LOOKUP_NOT_CONFIGURED' }
    };
  }

  try {
    const r = await axios.get(`${PROVIDERS()}/api/providers/by-user/${encodeURIComponent(req.user.id)}`, {
      timeout: 5_000,
      headers: { 'x-internal-token': process.env.INTERNAL_AUTH_TOKEN || '' }
    });
    if (!r.data?.providerSystemId) {
      return {
        status: 404,
        error: { error: 'PROVIDER_NOT_FOUND', message: 'No provider record is linked to this user.' }
      };
    }
    return r.data;
  } catch (err) {
    if (err.response?.status === 404) {
      return {
        status: 404,
        error: { error: 'PROVIDER_NOT_FOUND', message: 'No provider record is linked to this user.' }
      };
    }
    return {
      status: 502,
      error: { error: 'PROVIDER_LOOKUP_FAILED', message: err.message }
    };
  }
}
