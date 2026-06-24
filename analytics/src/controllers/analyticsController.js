const axios = require('axios');
const LogEntry = require('../models/LogEntry');

const EXPORT_TIME_ZONE = 'Europe/Athens';
const RESERVATIONS = () => process.env.RESERVATION_SERVICE_URL;

/**
 * Resolve a userId to a providerId via provider-service.
 * Returns the providerId string or null if no provider exists for this user.
 */
async function resolveProviderIdForUser(userId) {
  const base = process.env.PROVIDER_SERVICE_URL;
  if (!base || !userId) return null;
  try {
    const url = `${base}/api/providers/by-user/${encodeURIComponent(userId)}`;
    const r = await axios.get(url, {
      timeout: 5_000,
      headers: { 'x-internal-token': process.env.INTERNAL_AUTH_TOKEN || '' }
    });
    return r.data?.providerSystemId || null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    console.warn('[analytics-service] provider lookup failed:', err.message);
    return null;
  }
}

// Parse query: from, to, providerId, eventType — all optional
function buildBaseMatch(query) {
  const match = {};
  const { from, to, providerId, eventType } = query;
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to)   match.createdAt.$lte = new Date(to);
  }
  if (providerId) match.providerId = providerId;
  
  if (eventType) {
    // If multiple event types are requested, use $in
    if (Array.isArray(eventType)) {
      match.eventType = { $in: eventType };
    } else {
      match.eventType = eventType;
    }
  }
  return match;
}

async function runAggregations(match, tz = 'UTC') {
  // 1) totals by event type
  const totalsAgg = await LogEntry.aggregate([
    { $match: match },
    { $group: { _id: '$eventType', count: { $sum: 1 } } }
  ]);
  const totals = { CLICK: 0, SEARCH: 0, RESERVATION_CONFIRMED: 0, RESERVATION_REJECTED: 0 };
  for (const row of totalsAgg) totals[row._id] = row.count;

  // 2) per-provider breakdown
  const perProvider = await LogEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: { providerId: '$providerId', eventType: '$eventType' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.providerId',
        events: { $push: { eventType: '$_id.eventType', count: '$count' } },
        total: { $sum: '$count' }
      }
    },
    { $project: { _id: 0, providerId: '$_id', total: 1, events: 1 } },
    { $sort: { total: -1 } }
  ]);

  // 3) time series — daily buckets (across all providers in scope)
  const timeSeries = await LogEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          day:       { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
          eventType: '$eventType'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.day',
        buckets: { $push: { eventType: '$_id.eventType', count: '$count' } }
      }
    },
    { $project: { _id: 0, day: '$_id', buckets: 1 } },
    { $sort: { day: 1 } }
  ]);

  // 4) REAL per-provider daily series — grouped by providerId + day + eventType.
  // The operator page uses this to draw true per-provider lines instead of
  // approximating from each provider's period share.
  const providerSeries = await LogEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          providerId: '$providerId',
          day:        { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
          eventType:  '$eventType'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: { providerId: '$_id.providerId', day: '$_id.day' },
        buckets: { $push: { eventType: '$_id.eventType', count: '$count' } }
      }
    },
    {
      $group: {
        _id: '$_id.providerId',
        days: { $push: { day: '$_id.day', buckets: '$buckets' } }
      }
    },
    { $project: { _id: 0, providerId: '$_id', days: 1 } }
  ]);

  // 5) revenue rollup — sum of settled payment amounts (metadata.amount on
  // PAYMENT_COMPLETED events). Mirrors Stripe-settled revenue captured by the
  // analytics ingest of `payment.completed`. We override any eventType filter
  // from the caller so revenue is always computed from completed payments.
  const revenueMatch = { ...match, eventType: 'PAYMENT_COMPLETED' };
  const revenueAgg = await LogEntry.aggregate([
    { $match: revenueMatch },
    {
      $group: {
        _id: {
          providerId: '$providerId',
          day:        { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }
        },
        amount: { $sum: { $ifNull: ['$metadata.amount', 0] } }
      }
    }
  ]);
  const revenue = { total: 0, perProvider: {}, timeSeries: {} };
  for (const row of revenueAgg) {
    const amt = row.amount || 0;
    revenue.total += amt;
    const pid = row._id.providerId || 'unknown';
    revenue.perProvider[pid] = (revenue.perProvider[pid] || 0) + amt;
    revenue.timeSeries[row._id.day] = (revenue.timeSeries[row._id.day] || 0) + amt;
  }
  revenue.total = +revenue.total.toFixed(2);

  return { totals, perProvider, timeSeries, providerSeries, revenue };
}

// GET /api/analytics  — provider's own
exports.ownAnalytics = async (req, res) => {
  const providerId = await resolveProviderIdForUser(req.user.id);
  if (!providerId) {
    return res.status(404).json({
      error: 'PROVIDER_NOT_FOUND',
      message: 'No provider record is linked to this user. Register via /api/providers first.'
    });
  }
  const match = buildBaseMatch({ ...req.query, providerId });
  const data = await runAggregations(match, req.query.tz || 'UTC');
  res.json({ scope: 'own', providerId, filters: req.query, ...data });
};

// GET /api/analytics/global  — operator only
exports.globalAnalytics = async (req, res) => {
  const match = buildBaseMatch(req.query);
  const data = await runAggregations(match, req.query.tz || 'UTC');
  res.json({ scope: 'global', filters: req.query, ...data });
};

//  POST /api/analytics/export   body: { from, to, providerId?, format, timeZone? }
exports.exportLogs = async (req, res) => {
  try {
    const { from, to, format, eventType } = req.body || {};
    const timeZone = safeTimeZone(req.body?.timeZone || req.body?.tz || EXPORT_TIME_ZONE);
    const providerId = await resolveExportProviderId(req, req.body?.providerId);
    if (providerId && providerId.error) {
      return res.status(providerId.status).json(providerId.error);
    }
    const match = buildExportMatch({ from, to, providerId, eventType, timeZone });
    // Optimized query by explicit projection and cursor batch size, to avoid memory issues with large exports. 
    // Fetch what you only need
    const rawRows = await LogEntry.find(match)
      .select('createdAt eventType providerId stationId userId metadata')
      .sort({ createdAt: 1 })
      .limit(50_000)
      .lean();
    const rows = await filterExportRows(rawRows);

    if ((format || 'json').toLowerCase() === 'csv') {
      const headers = [
        'createdAtAthens',
        'createdAtUtc',
        'eventType',
        'providerId',
        'stationId',
        'userId',
        'reservationId',
        'endTimeAthens'
      ];
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          formatInTimeZone(r.createdAt, timeZone),
          new Date(r.createdAt).toISOString(),
          r.eventType,
          r.providerId || '',
          r.stationId  || '',
          r.userId     || '',
          r.metadata?.reservationId || '',
          r.metadata?.endTime ? formatInTimeZone(r.metadata.endTime, timeZone) : ''
        ].map(csvEscape).join(','));
      }
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="saasplug-logs.csv"');
      return res.send(lines.join('\n'));
    }
    res.json({
      count: rows.length,
      timeZone,
      rows: rows.map(r => ({
        ...r,
        createdAtAthens: formatInTimeZone(r.createdAt, timeZone),
        createdAtUtc: new Date(r.createdAt).toISOString(),
        reservationId: r.metadata?.reservationId || null,
        endTimeAthens: r.metadata?.endTime ? formatInTimeZone(r.metadata.endTime, timeZone) : null
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
  }
};

function buildExportMatch({ from, to, providerId, eventType, timeZone }) {
  const match = buildBaseMatch({ providerId, eventType });
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = parseExportBoundary(from, timeZone, 'start');
    if (to)   match.createdAt.$lte = parseExportBoundary(to, timeZone, 'end');
  }
  return match;
}

async function filterExportRows(rows) {
  const confirmed = rows.filter(r => r.eventType === 'RESERVATION_CONFIRMED');
  if (!confirmed.length) return rows;

  const now = new Date();
  const reservationIds = confirmed
    .map(r => r.metadata?.reservationId)
    .filter(Boolean);
  const reservationStatuses = await fetchReservationStatuses(reservationIds);
  const cancelledIds = new Set();

  if (reservationIds.length) {
    const cancelledRows = await LogEntry.find({
      eventType: 'RESERVATION_CANCELLED',
      'metadata.reservationId': { $in: reservationIds }
    })
      .select('metadata.reservationId')
      .lean();
    for (const row of cancelledRows) {
      if (row.metadata?.reservationId) cancelledIds.add(row.metadata.reservationId);
    }
  }

  return rows.filter(row => {
    if (row.eventType !== 'RESERVATION_CONFIRMED') return true;
    const reservationId = row.metadata?.reservationId;
    const currentReservation = reservationId ? reservationStatuses.get(reservationId) : null;
    if (currentReservation) {
      return currentReservation.status === 'EXPIRED';
    }

    const end = row.metadata?.endTime ? new Date(row.metadata.endTime) : null;
    if (!end || Number.isNaN(end.getTime()) || end > now) return false;
    return !reservationId || !cancelledIds.has(reservationId);
  });
}

async function fetchReservationStatuses(reservationIds) {
  const statuses = new Map();
  if (!RESERVATIONS() || !reservationIds.length) return statuses;

  try {
    const r = await axios.post(
      `${RESERVATIONS()}/api/reservations/internal/statuses`,
      { reservationIds },
      {
        timeout: 5_000,
        headers: { 'x-internal-token': process.env.INTERNAL_AUTH_TOKEN || '' }
      }
    );
    for (const row of r.data?.reservations || []) {
      if (row.reservationId) statuses.set(row.reservationId, row);
    }
  } catch (err) {
    console.warn('[analytics-service] reservation status lookup failed:', err.message);
  }

  return statuses;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseExportBoundary(value, timeZone, edge) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return zonedDateTimeToUtc({
      year,
      month,
      day,
      hour: edge === 'end' ? 23 : 0,
      minute: edge === 'end' ? 59 : 0,
      second: edge === 'end' ? 59 : 0
    }, timeZone);
  }
  return new Date(value);
}

function safeTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return EXPORT_TIME_ZONE;
  }
}

function zonedDateTimeToUtc(parts, timeZone) {
  const targetUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  let candidate = new Date(targetUtcMs);

  for (let i = 0; i < 3; i += 1) {
    const candidateParts = getTimeZoneParts(candidate, timeZone);
    const candidateAsUtcMs = Date.UTC(
      candidateParts.year,
      candidateParts.month - 1,
      candidateParts.day,
      candidateParts.hour,
      candidateParts.minute,
      candidateParts.second
    );
    candidate = new Date(candidate.getTime() - (candidateAsUtcMs - targetUtcMs));
  }

  return candidate;
}

function getTimeZoneParts(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const mapped = {};
  for (const part of parts) {
    if (part.type !== 'literal') mapped[part.type] = part.value;
  }
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
    hour: Number(mapped.hour),
    minute: Number(mapped.minute),
    second: Number(mapped.second)
  };
}

function formatInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getTimeZoneParts(date, timeZone);
  const pad = n => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

async function resolveExportProviderId(req, requestedProviderId) {
  if (req.user?.role === 'operator') return requestedProviderId || null;

  const ownProviderId = await resolveProviderIdForUser(req.user?.id);
  if (!ownProviderId) {
    return {
      status: 404,
      error: {
        error: 'PROVIDER_NOT_FOUND',
        message: 'No provider record is linked to this user. Register via /api/providers first.'
      }
    };
  }

  if (requestedProviderId && requestedProviderId !== ownProviderId) {
    return {
      status: 403,
      error: {
        error: 'FORBIDDEN',
        message: 'Providers can only export logs for their own stations.'
      }
    };
  }

  return ownProviderId;
}

exports._private = { buildBaseMatch, buildExportMatch, resolveExportProviderId };
