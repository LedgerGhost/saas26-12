const test = require('node:test');
const assert = require('node:assert');

// Stub out modules that would otherwise hit the network or DB at require-time.
const Module = require('module');
const origRequire = Module.prototype.require;
const stubs = new Map([
  ['axios', { get: async () => ({}), post: async () => ({}) }],
  ['mongoose', { startSession: async () => ({ withTransaction: async fn => fn(), endSession: () => {} }) }],
  ['@saasplug/shared-utils', { publish: async () => {} }],
  ['stripe', () => ({ webhooks: { constructEvent: () => {} } })],
  ['../models/Invoice', { create: async () => [{}] }],
  ['../models/Charge',  { find: () => ({ session: () => [] }), updateMany: async () => ({}) }],
  ['../models/Payment', { create: async () => ({}) }]
]);
Module.prototype.require = function (id) {
  return stubs.has(id) ? stubs.get(id) : origRequire.call(this, id);
};

const { rollupLineItems } = require('../src/controllers/invoiceController');

test('returns empty list for no charges', () => {
  assert.deepStrictEqual(rollupLineItems([]), []);
});

test('groups charges by day and computes unit + subtotal', () => {
  const charges = [
    { amount: 0.50, createdAt: '2026-05-20T10:00:00Z' },
    { amount: 0.50, createdAt: '2026-05-20T15:00:00Z' },
    { amount: 1.00, createdAt: '2026-05-21T09:00:00Z' }
  ];
  const out = rollupLineItems(charges);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].description, 'Reservations on 2026-05-20');
  assert.strictEqual(out[0].quantity, 2);
  assert.strictEqual(out[0].subtotal, 1.00);
  assert.strictEqual(out[0].unitPrice, 0.5);
  assert.strictEqual(out[1].quantity, 1);
  assert.strictEqual(out[1].subtotal, 1.00);
});

test('handles fractional unit prices via rounding', () => {
  const charges = [
    { amount: 1, createdAt: '2026-05-22T00:00:00Z' },
    { amount: 2, createdAt: '2026-05-22T00:00:00Z' },
    { amount: 4, createdAt: '2026-05-22T00:00:00Z' }
  ];
  const out = rollupLineItems(charges);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].quantity, 3);
  assert.strictEqual(out[0].subtotal, 7.00);
  // 7 / 3 = 2.3333… → rounded to 4dp
  assert.strictEqual(out[0].unitPrice, 2.3333);
});
