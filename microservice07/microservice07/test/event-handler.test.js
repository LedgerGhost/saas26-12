const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const created = [];
const stubs = new Map([
  ['../models/LogEntry', {
    create: async (doc) => {
      if (Array.isArray(doc)) created.push(...doc);
      else created.push(doc);
    }
  }]
]);

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  return stubs.has(id) ? stubs.get(id) : origRequire.call(this, id);
};

const eventHandler = require('../src/services/eventHandler');

test('expands broad station searches into provider-scoped log entries', async () => {
  created.length = 0;

  await eventHandler('station.searched', {
    userId: 'user-1',
    filters: {},
    providerCounts: { redPlug: 3, greenPlug: 0, bluePlug: 2 },
    resultCount: 5,
    ts: '2026-05-24T10:00:00.000Z'
  });

  assert.strictEqual(created.length, 2);
  assert.deepStrictEqual(created.map(e => e.providerId).sort(), ['bluePlug', 'redPlug']);
  assert.strictEqual(created.find(e => e.providerId === 'redPlug').metadata.providerResultCount, 3);
  assert.strictEqual(created.find(e => e.providerId === 'bluePlug').metadata.providerResultCount, 2);
});

test('keeps provider-filtered station searches as one log entry', async () => {
  created.length = 0;

  await eventHandler('station.searched', {
    userId: 'user-1',
    providerId: 'redPlug',
    providerCounts: { redPlug: 3 },
    resultCount: 3,
    ts: '2026-05-24T10:00:00.000Z'
  });

  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].providerId, 'redPlug');
  assert.strictEqual(created[0].eventType, 'SEARCH');
});
