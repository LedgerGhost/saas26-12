const axios = require('axios');
const Reservation = require('../models/Reservation');
const { publish, logger } = require('@saasplug/shared-utils');

const log = logger('reservation-service');
const ORCH = () => process.env.ORCHESTRATOR_URL;
const PROVIDER_BASE = () => process.env.PROVIDER_SERVICE_URL;

/**
 * Look up the saasPlug Provider record for a given upstream provider-system id
 * (e.g. "redPlug"). Used to override the adapter's hardcoded charge with the
 * provider's configured `ratePerReservation`. Falls back to null on any error
 * so reservation still proceeds with whatever the adapter returned.
 */
async function fetchProviderPricing(providerSystemId) {
  if (!providerSystemId || !PROVIDER_BASE()) return null;
  try {
    const r = await axios.get(
      `${PROVIDER_BASE()}/api/providers/by-system/${encodeURIComponent(providerSystemId)}`,
      {
        timeout: 4_000,
        headers: { 'x-internal-token': process.env.INTERNAL_AUTH_TOKEN || '' },
        validateStatus: s => s < 500
      }
    );
    if (r.status !== 200) return null;
    return r.data;
  } catch (err) {
    log.warn(`provider pricing lookup failed for ${providerSystemId}: ${err.message}`);
    return null;
  }
}

exports.requireUser = (req, res, next) => {
  if (!req.user?.id) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  next();
};

function reservationEndDate(reservation) {
  if (!reservation?.endTime) return null;
  const end = reservation.endTime instanceof Date ? reservation.endTime : new Date(reservation.endTime);
  return Number.isNaN(end.getTime()) ? null : end;
}

function isReservationLive(reservation, now = new Date()) {
  const end = reservationEndDate(reservation);
  return reservation?.status === 'CONFIRMED' && !!end && end > now;
}

async function expireEndedReservations(scopeFilter = {}, now = new Date()) {
  await Reservation.updateMany(
    {
      ...scopeFilter,
      status: 'CONFIRMED',
      $or: [
        { endTime: { $lte: now } },
        { endTime: null },
        { endTime: { $exists: false } }
      ]
    },
    { $set: { status: 'EXPIRED' } }
  );
}

async function expireReservationIfEnded(doc, now = new Date()) {
  if (doc?.status === 'CONFIRMED' && !isReservationLive(doc, now)) {
    doc.status = 'EXPIRED';
    await doc.save();
  }
  return doc;
}

/** POST /api/reservations  body: { stationId, minutes? } */
exports.create = async (req, res) => {
  const { stationId, minutes } = req.body || {};
  if (!stationId) return res.status(400).json({ error: 'STATION_ID_REQUIRED' });

  try {
    // 1) Call orchestrator → adapter → external provider
    const upstream = await axios.post(
      `${ORCH()}/stations/${encodeURIComponent(stationId)}/reserve`,
      { minutes: minutes || 30 },
      { timeout: 12_000 }
    );
    const result = upstream.data || {};
    const confirmed = result.confirmed === true;
    const providerSystemId = result.providerId || stationId.split(':')[0];

    // Override the adapter's hardcoded charge with the provider's configured
    // rate (when available). Only meaningful for CONFIRMED reservations.
    let chargeAmount = result.chargeAmount || 0;
    let pricingSource = 'adapter';
    if (confirmed) {
      const pricing = await fetchProviderPricing(providerSystemId);
      if (pricing && typeof pricing.ratePerReservation === 'number') {
        chargeAmount = pricing.ratePerReservation;
        pricingSource = 'provider';
      }
    }

    // 2) Persist
    const doc = await Reservation.create({
      userId: req.user.id,
      userEmail: req.user.email || null,
      stationId,
      providerId: providerSystemId,
      externalStationId: result.externalStationId || stationId.split(':')[1],
      status: confirmed ? 'CONFIRMED' : 'REJECTED',
      requestedMinutes: minutes || 30,
      endTime: result.endTime ? new Date(result.endTime) : null,
      chargeAmount,
      currency: result.currency || 'EUR',
      providerResponse: { ...result, pricingSource }
    });

    // 3) Publish event (fire-and-forget)
    const routingKey = confirmed ? 'reservation.confirmed' : 'reservation.rejected';
    publish(routingKey, {
      reservationId: doc._id.toString(),
      userId: doc.userId,
      stationId: doc.stationId,
      providerId: doc.providerId,
      chargeAmount: doc.chargeAmount,
      currency: doc.currency,
      endTime: doc.endTime,
      ts: new Date().toISOString()
    }).catch(e => log.warn(`publish ${routingKey} failed: ${e.message}`));

    // 4) Respond
    const httpStatus = confirmed ? 201 : 409;
    res.status(httpStatus).json({
      reservationId: doc._id.toString(),
      stationId: doc.stationId,
      providerId: doc.providerId,
      status: doc.status,
      endTime: doc.endTime,
      chargeAmount: doc.chargeAmount,
      currency: doc.currency
    });
  } catch (err) {
    log.error(`create reservation failed: ${err.message}`);
    res.status(502).json({ error: 'RESERVATION_FAILED', message: err.message });
  }
};

/**
 * GET /api/reservations
 * Default: returns only the caller's reservations.
 * Operators may pass ?scope=all to see every user's reservations (with userEmail).
 */
exports.listMine = async (req, res) => {
  const wantsAll = req.query.scope === 'all';
  const isOperator = req.user.role === 'operator';

  const filter = (wantsAll && isOperator) ? {} : { userId: req.user.id };
  const limit = Math.min(parseInt(req.query.limit, 10) || (wantsAll ? 200 : 50), 500);

  await expireEndedReservations(filter);

  const docs = await Reservation.find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();
  res.json({
    scope: wantsAll && isOperator ? 'all' : 'own',
    reservations: docs.map(toDTO)
  });
};

/** GET /api/reservations/:id */
exports.getOne = async (req, res) => {
  const doc = await Reservation.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND' });
  if (doc.userId !== req.user.id && req.user.role !== 'operator') {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  await expireReservationIfEnded(doc);
  res.json(toDTO(doc));
};

/** POST /api/reservations/:id/cancel */
exports.cancel = async (req, res) => {
  const doc = await Reservation.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'NOT_FOUND' });
  if (doc.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
  if (doc.status !== 'CONFIRMED') {
    return res.status(409).json({ error: 'NOT_ACTIVE', message: `Reservation is ${doc.status}.` });
  }

  if (!isReservationLive(doc)) {
    doc.status = 'EXPIRED';
    await doc.save();
    return res.status(409).json({
      error: 'RESERVATION_EXPIRED',
      message: 'Reservation has already ended.',
      reservation: toDTO(doc)
    });
  }

  doc.status = 'CANCELLED';
  await doc.save();

  publish('reservation.cancelled', {
    reservationId: doc._id.toString(),
    userId: doc.userId,
    stationId: doc.stationId,
    providerId: doc.providerId,
    ts: new Date().toISOString()
  }).catch(e => log.warn(`publish reservation.cancelled failed: ${e.message}`));

  res.json(toDTO(doc));
};

function toDTO(d) {
  return {
    reservationId: d._id.toString(),
    userId: d.userId,
    userEmail: d.userEmail || null,
    stationId: d.stationId,
    providerId: d.providerId,
    status: d.status,
    endTime: d.endTime,
    chargeAmount: d.chargeAmount,
    currency: d.currency,
    createdAt: d.created_at
  };
}
