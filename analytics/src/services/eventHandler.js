const LogEntry = require('../models/LogEntry');

const ROUTING_TO_EVENT_TYPE = {
  'station.searched':       'SEARCH',
  'station.clicked':        'CLICK',
  'reservation.confirmed':  'RESERVATION_CONFIRMED',
  'reservation.rejected':   'RESERVATION_REJECTED',
  'reservation.cancelled':  'RESERVATION_CANCELLED',
  'invoice.issued':         'INVOICE_ISSUED',
  'payment.completed':      'PAYMENT_COMPLETED'
};

module.exports = async function eventHandler(routingKey, payload) {
  const eventType = ROUTING_TO_EVENT_TYPE[routingKey];
  if (!eventType) {
    console.warn(`[analytics-service] unknown routing key: ${routingKey}`);
    return;
  }

  if (routingKey === 'station.searched') {
    const entries = searchEntries(eventType, payload);
    if (entries.length > 0) {
      await LogEntry.create(entries);
      return;
    }
  }

  await LogEntry.create(toLogEntry(eventType, payload));
};

function searchEntries(eventType, payload = {}) {
  if (payload.providerId) return [toLogEntry(eventType, payload)];

  const providerCounts = payload.providerCounts;
  if (!providerCounts || typeof providerCounts !== 'object') return [];

  return Object.entries(providerCounts)
    .filter(([providerId, count]) => providerId && Number(count) > 0)
    .map(([providerId, count]) => toLogEntry(eventType, {
      ...payload,
      providerId,
      providerResultCount: Number(count)
    }));
}

function toLogEntry(eventType, payload = {}) {
  return {
    eventType,
    providerId: payload.providerId || null,
    stationId:  payload.stationId  || null,
    userId:     payload.userId     || null,
    metadata:   payload,
    createdAt:  payload.ts ? new Date(payload.ts) : new Date()
  };
}
