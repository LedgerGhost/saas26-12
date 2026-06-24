const axios = require('axios');
const StationCache = require('../models/StationCache');
const { normalizeStationStatus } = require('@saasplug/shared-utils');

/**
 * Consumes reservation.* events and keeps the StationCache fresh:
 *  - On reservation.confirmed: mark the station reserved immediately so subsequent
 *    map searches reflect reality without waiting for the cache TTL. Then refresh
 *    from the upstream provider in the background.
 *  - On reservation.cancelled/rejected: opportunistically refresh from the provider.
 */
module.exports = async function eventHandler(routingKey, payload) {
  const stationId = payload?.stationId;
  if (!stationId) return;

  if (routingKey === 'reservation.confirmed') {
    // 1) Optimistic in-cache update so the map shows reserved before the next refresh.
    try {
      await StationCache.findOneAndUpdate(
        { stationId },
        { status: 'reserved', lastSyncedAt: new Date() },
        { upsert: false }
      );
    } catch (err) {
      console.warn(`[stations-service] cache optimistic update failed for ${stationId}:`, err.message);
    }
  }

  if (routingKey === 'reservation.cancelled') {
    try {
      await StationCache.findOneAndUpdate(
        { stationId },
        { lastSyncedAt: new Date() },
        { upsert: false }
      );
    } catch (err) {
      console.warn(`[stations-service] cache cancellation update failed for ${stationId}:`, err.message);
    }
  }

  // 2) Fire-and-forget refresh against the orchestrator so we converge to the truth.
  const orch = process.env.ORCHESTRATOR_URL;
  if (!orch) return;
  axios.get(`${orch}/stations/${encodeURIComponent(stationId)}`, { timeout: 5_000 })
    .then(async r => {
      const d = r.data;
      if (!d?.status) return;
      const existing = await StationCache.findOne({ stationId: d.stationId || stationId })
        .select('manualStatus status')
        .lean();
      return StationCache.findOneAndUpdate(
        { stationId: d.stationId || stationId },
        {
          status: existing?.manualStatus ? normalizeStationStatus(existing.status) : normalizeStationStatus(d.status),
          pricePerKwh: d.pricePerKwh,
          lastSyncedAt: new Date()
        },
        { upsert: false }
      );
    })
    .catch(err => console.warn(`[stations-service] cache refresh failed for ${stationId}:`, err.message));
};
