const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const aggregateMatches = [];
let exportRows = [];
let cancelledRows = [];
let reservationStatusRows = [];

function queryResult(rows) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => rows
  };
  return chain;
}

const stubs = new Map([
  ['axios', {
    get: async () => ({ data: { providerSystemId: 'own-provider' } }),
    post: async () => ({ data: { reservations: reservationStatusRows } })
  }],
  ['../models/LogEntry', {
    aggregate: async (pipeline) => {
      aggregateMatches.push(pipeline[0].$match);
      return [];
    },
    find: (match) => queryResult(match?.eventType === 'RESERVATION_CANCELLED' ? cancelledRows : exportRows)
  }]
]);

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  return stubs.has(id) ? stubs.get(id) : origRequire.call(this, id);
};

process.env.PROVIDER_SERVICE_URL = 'http://provider-service:5002';
process.env.RESERVATION_SERVICE_URL = 'http://reservation-service:5004';
process.env.INTERNAL_AUTH_TOKEN = 'internal-test-token';

const ctrl = require('../src/controllers/analyticsController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    send(b) { this.body = b; return this; }
  };
}

test('own analytics ignores caller-supplied providerId and uses linked provider', async () => {
  aggregateMatches.length = 0;
  const res = mockRes();

  await ctrl.ownAnalytics({
    user: { id: 'user-1', role: 'provider' },
    query: { providerId: 'other-provider', from: '2026-05-01T00:00:00Z' }
  }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.providerId, 'own-provider');
  assert.ok(aggregateMatches.length > 0);
  assert.ok(aggregateMatches.every(match => match.providerId === 'own-provider'));
});

test('provider export rejects another providerId', async () => {
  const res = mockRes();

  await ctrl.exportLogs({
    user: { id: 'user-1', role: 'provider' },
    body: { providerId: 'other-provider', format: 'json' }
  }, res);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.error, 'FORBIDDEN');
});

test('export omits confirmed reservations until ended and excludes cancelled ones', async () => {
  exportRows = [
    {
      createdAt: new Date('2026-06-24T09:00:00.000Z'),
      eventType: 'RESERVATION_CONFIRMED',
      providerId: 'redPlug',
      stationId: 'redPlug:1',
      userId: 'anna',
      metadata: { reservationId: 'ended', endTime: '2026-06-24T10:00:00.000Z' }
    },
    {
      createdAt: new Date('2026-06-24T09:30:00.000Z'),
      eventType: 'RESERVATION_CONFIRMED',
      providerId: 'redPlug',
      stationId: 'redPlug:2',
      userId: 'anna',
      metadata: { reservationId: 'active', endTime: '2999-01-01T10:00:00.000Z' }
    },
    {
      createdAt: new Date('2026-06-24T10:00:00.000Z'),
      eventType: 'RESERVATION_CONFIRMED',
      providerId: 'redPlug',
      stationId: 'redPlug:3',
      userId: 'anna',
      metadata: { reservationId: 'cancelled', endTime: '2026-06-24T11:00:00.000Z' }
    },
    {
      createdAt: new Date('2026-06-24T11:00:00.000Z'),
      eventType: 'CLICK',
      providerId: 'redPlug',
      stationId: 'redPlug:4',
      userId: 'anna',
      metadata: {}
    }
  ];
  cancelledRows = [{ metadata: { reservationId: 'cancelled' } }];
  reservationStatusRows = [
    { reservationId: 'ended', status: 'EXPIRED', endTime: '2026-06-24T10:00:00.000Z' },
    { reservationId: 'active', status: 'CONFIRMED', endTime: '2999-01-01T10:00:00.000Z' },
    { reservationId: 'cancelled', status: 'CANCELLED', endTime: '2026-06-24T11:00:00.000Z' }
  ];
  const res = mockRes();

  await ctrl.exportLogs({
    user: { id: 'operator-1', role: 'operator' },
    body: {
      providerId: 'redPlug',
      eventType: ['RESERVATION_CONFIRMED', 'CLICK'],
      from: '2026-06-24',
      to: '2026-06-24',
      timeZone: 'Europe/Athens',
      format: 'json'
    }
  }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(
    res.body.rows.map(row => row.reservationId || row.eventType),
    ['ended', 'CLICK']
  );
  assert.strictEqual(res.body.rows[0].createdAtAthens, '2026-06-24 12:00:00');

  exportRows = [];
  cancelledRows = [];
  reservationStatusRows = [];
});
