const axios = require('axios');
const LogEntry = require('../models/LogEntry');

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

  // 3) time series — daily buckets
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

  return { totals, perProvider, timeSeries };
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

//  POST /api/analytics/export   body: { from, to, providerId?, format } 
exports.exportLogs = async (req, res) => {
  try {
    const { from, to, format, eventType } = req.body || {};
    const providerId = await resolveExportProviderId(req, req.body?.providerId);
    if (providerId && providerId.error) {
      return res.status(providerId.status).json(providerId.error);
    }
    const match = buildBaseMatch({ from, to, providerId, eventType });
    // Optimized query by explicit projection and cursor batch size, to avoid memory issues with large exports. 
    // Fetch what you only need
    const rows = await LogEntry.find(match)
      .select('createdAt eventType providerId stationId userId')
      .sort({ createdAt: 1 })
      .limit(50_000)
      .lean();

    if ((format || 'json').toLowerCase() === 'csv') {
      const headers = ['createdAt', 'eventType', 'providerId', 'stationId', 'userId'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          new Date(r.createdAt).toISOString(),
          r.eventType,
          r.providerId || '',
          r.stationId  || '',
          r.userId     || ''
        ].map(csvEscape).join(','));
      }
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="saasplug-logs.csv"');
      return res.send(lines.join('\n'));
    }
    res.json({ count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
  }
};

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

exports._private = { buildBaseMatch, resolveExportProviderId };
