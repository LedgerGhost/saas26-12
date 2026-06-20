const Charge = require('../models/Charge');

/**
 * Consumes reservation.confirmed events and accumulates Charges per provider.
 * On reservation.cancelled, removes an un-invoiced charge for that reservation.
 * Payload (from reservation-service):
 *   { reservationId, userId, stationId, providerId, chargeAmount, currency, stationId endTime, ts }
 */
module.exports = async function eventHandler(routingKey, payload) {
  if (routingKey === 'reservation.cancelled') {
    const { reservationId } = payload || {};
    if (!reservationId) return;
    await Charge.deleteOne({ reservationId, invoicedAt: null });
    return;
  }

  if (routingKey !== 'reservation.confirmed') return;
  const { reservationId, providerId, chargeAmount, currency, stationId, endTime } = payload || {};
  
  if (!reservationId || !providerId || typeof chargeAmount !== 'number') {
    console.warn('[billing-service] ignoring malformed reservation.confirmed:', payload);
    return;
  }
  if (chargeAmount <= 0) return; // nothing to bill

  try {
    await Charge.create({
      providerId,
      reservationId,
      stationId,         // Captured for frontend UI details
      endTime,           // Captured for exact timestamping
      amount: chargeAmount,
      currency: currency || 'EUR'
    });
  } catch (err) {
    if (err.code === 11000) return; // Duplicate reservationId swallow
    throw err;
  }
};
