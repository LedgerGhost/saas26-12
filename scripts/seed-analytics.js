#!/usr/bin/env node
/**
 * saasPlug analytics seed
 * -----------------------
 * Inserts realistic `log_entries` into the analytics MongoDB so the operator
 * "Global analytics" page and the provider "Overview" page render populated
 * charts. Timestamps are spread across the last N days (one bucket per day)
 * following a smooth wave + jitter, so the daily line chart looks natural
 * (like the design mock).
 *
 * The analytics aggregations COUNT documents (one row per event), so we insert
 * one LogEntry per event. Event types match analytics/src/models/LogEntry.js:
 *   CLICK, SEARCH, RESERVATION_CONFIRMED, RESERVATION_REJECTED,
 *   INVOICE_ISSUED, PAYMENT_COMPLETED
 *
 * Run it INSIDE the docker network (mongo ports are not published to host):
 *
 *   docker compose run --rm --no-deps \
 *     -v "$PWD/scripts:/seed" \
 *     analytics-service node /seed/seed-analytics.js
 *
 * MONGO_URI is already set inside the analytics-service container.
 * Override DAYS / PROVIDERS / PROVIDER_PRIMARY via env if needed.
 *
 * Re-runnable: pass WIPE=1 to clear existing log_entries first.
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo-analyticsdb:27017/analytics';
const DAYS = Number(process.env.DAYS || 30);
// providerId values must match what the rest of the platform uses.
// The demo provider (founder@coolcharge.demo) registers as `redPlug`,
// so redPlug drives the provider's own Overview page.
const PROVIDERS = (process.env.PROVIDERS || 'redPlug,greenPlug,bluePlug').split(',').map(s => s.trim());

const EVENT_TYPES = [
  'CLICK', 'SEARCH',
  'RESERVATION_CONFIRMED', 'RESERVATION_REJECTED',
  'INVOICE_ISSUED', 'PAYMENT_COMPLETED'
];

const logSchema = new mongoose.Schema({
  eventType:  { type: String, enum: EVENT_TYPES, required: true, index: true },
  providerId: { type: String, index: true },
  stationId:  { type: String, index: true },
  userId:     { type: String, index: true },
  metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt:  { type: Date, default: Date.now, index: true }
}, { collection: 'log_entries' });

const LogEntry = mongoose.model('LogEntry', logSchema);

// Per-provider "weight" so the leaderboard / donut look varied (like the mock).
const WEIGHTS = { redPlug: 1.0, greenPlug: 0.78, bluePlug: 0.55 };
// A couple of station ids per provider so stationId is populated.
const STATIONS = {
  redPlug:   ['redPlug:42', 'redPlug:09', 'redPlug:30', 'redPlug:55', 'redPlug:18', 'redPlug:71'],
  greenPlug: ['greenPlug:03', 'greenPlug:11', 'greenPlug:27'],
  bluePlug:  ['bluePlug:05', 'bluePlug:14', 'bluePlug:22']
};

const rnd = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Smooth wave (0..1) across the period + daily jitter, so the chart undulates.
function dayFactor(dayIdx, total) {
  const phase = (dayIdx / total) * Math.PI * 2.2;
  const wave = (Math.sin(phase) + 1) / 2;          // 0..1
  const trend = dayIdx / total;                     // gentle upward trend
  const jitter = (Math.random() - 0.5) * 0.18;
  return Math.max(0.25, Math.min(1, 0.45 + 0.4 * wave + 0.25 * trend + jitter));
}

function pointInDay(daysAgo) {
  // local-ish midnight anchor, then a random time during business hours
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(rnd(7, 21), rnd(0, 59), rnd(0, 59), 0);
  return d;
}

async function main() {
  console.log('[seed-analytics] connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  if (process.env.WIPE === '1') {
    const del = await LogEntry.deleteMany({});
    console.log(`[seed-analytics] wiped ${del.deletedCount} existing log_entries`);
  }

  const docs = [];
  let userSeq = 0;

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const dayIdx = DAYS - 1 - daysAgo;
    const f = dayFactor(dayIdx, DAYS);

    for (const providerId of PROVIDERS) {
      const w = WEIGHTS[providerId] ?? 0.6;
      const stations = STATIONS[providerId] || [`${providerId}:01`];

      // Funnel: searches > clicks > confirmed > rejected.
      const searches  = Math.round(rnd(55, 90) * f * w);
      const clicks    = Math.round(searches * (0.42 + Math.random() * 0.12));
      const confirmed = Math.round(clicks   * (0.30 + Math.random() * 0.12));
      const rejected  = Math.round(confirmed * (0.06 + Math.random() * 0.08));

      const emit = (eventType, n, extra = {}) => {
        for (let i = 0; i < n; i++) {
          const userId = `u_${(userSeq++ % 400)}`;
          docs.push({
            eventType,
            providerId,
            stationId: pick(stations),
            userId,
            metadata: { seeded: true, ...extra },
            createdAt: pointInDay(daysAgo)
          });
        }
      };

      emit('SEARCH', searches);
      emit('CLICK', clicks);
      emit('RESERVATION_CONFIRMED', confirmed);
      emit('RESERVATION_REJECTED', rejected);

      // A few revenue-bearing events so PAYMENT_COMPLETED / INVOICE_ISSUED
      // totals (and any future revenue rollup) are non-empty.
      const payments = Math.round(confirmed * 0.6);
      for (let i = 0; i < payments; i++) {
        const amount = +(rnd(8, 45) + Math.random()).toFixed(2);
        docs.push({
          eventType: 'PAYMENT_COMPLETED',
          providerId, stationId: pick(stations), userId: `u_${userSeq++ % 400}`,
          metadata: { seeded: true, amount, currency: 'EUR' },
          createdAt: pointInDay(daysAgo)
        });
      }
    }
  }

  // Monthly invoice.issued markers (1 per provider per past month covered)
  for (const providerId of PROVIDERS) {
    for (let m = 1; m <= Math.ceil(DAYS / 30); m++) {
      docs.push({
        eventType: 'INVOICE_ISSUED',
        providerId, stationId: null, userId: null,
        metadata: { seeded: true, billingPeriod: `2026-0${6 - m}` },
        createdAt: pointInDay(Math.min(DAYS - 1, m * 28))
      });
    }
  }

  console.log(`[seed-analytics] inserting ${docs.length} log entries across ${DAYS} days for ${PROVIDERS.join(', ')}…`);
  await LogEntry.insertMany(docs, { ordered: false });

  // Quick summary
  const byType = await LogEntry.aggregate([
    { $match: { 'metadata.seeded': true } },
    { $group: { _id: '$eventType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('[seed-analytics] totals by event type:');
  for (const r of byType) console.log(`   ${r._id.padEnd(22)} ${r.count}`);

  await mongoose.disconnect();
  console.log('[seed-analytics] done.');
}

main().catch(err => { console.error('[seed-analytics] failed:', err); process.exit(1); });
