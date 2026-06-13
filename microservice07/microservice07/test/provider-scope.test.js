const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const aggregateMatches = [];
const stubs = new Map([
  ['axios', {
    get: async () => ({ data: { providerSystemId: 'own-provider' } })
  }],
  ['../models/LogEntry', {
    aggregate: async (pipeline) => {
      aggregateMatches.push(pipeline[0].$match);
      return [];
    },
    find: () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => []
        })
      })
    })
  }]
]);

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  return stubs.has(id) ? stubs.get(id) : origRequire.call(this, id);
};

process.env.PROVIDER_SERVICE_URL = 'http://provider-service:5002';
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
