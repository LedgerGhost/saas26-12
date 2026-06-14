const test = require('node:test');
const assert = require('node:assert');

// We test only the input-validation slice of providerController.register —
// the parts that don't need Mongo or axios. We do this by stubbing the
// modules the controller requires before loading it.
const Module = require('module');
const origResolve = Module._resolve_filename || Module._resolveFilename;

const stubs = new Map();
function stub(name, exports) { stubs.set(name, exports); }

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (stubs.has(id)) return stubs.get(id);
  return origRequire.call(this, id);
};

// --- Stubs ---
const fakeProvider = {
  PRICING_PLANS: ['basic', 'pro'],
  STATUSES: ['active', 'suspended'],
  exists: async () => null,
  create: async (doc) => ({ ...doc, _id: 'provider-id', save: async () => {} }),
  deleteOne: async () => {}
};
stub('../models/Provider', fakeProvider);

stub('axios', {
  get:  async () => ({ status: 200, data: [] }),
  post: async () => ({ status: 201, data: { clientId: 'cid_x', clientSecret: 'csec_y' } })
});

stub('bcryptjs', { hash: async (s) => 'hashed:' + s });

const ctrl = require('../src/controllers/providerController');

// --- Helpers ---
function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

test('rejects when companyName missing', async () => {
  const res = mockRes();
  await ctrl.register({ body: { contactEmail: 'a@b.c', apiBaseUrl: 'http://x', apiKey: 'k' }, user: null }, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'MISSING_FIELDS');
});

test('rejects unknown pricingPlan', async () => {
  const res = mockRes();
  await ctrl.register({
    body: { companyName: 'Co', contactEmail: 'a@b.c', apiBaseUrl: 'http://x', apiKey: 'k', pricingPlan: 'enterprise' },
    user: null
  }, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, 'INVALID_PRICING_PLAN');
});

test('happy path returns 201 with credentials shown once', async () => {
  const res = mockRes();
  await ctrl.register({
    body: { companyName: 'Co', contactEmail: 'a@b.c', apiBaseUrl: 'http://x', apiKey: 'k' },
    user: { id: 'u1' }
  }, res);
  assert.strictEqual(res.statusCode, 201);
  assert.ok(res.body.credentials.clientSecret, 'plaintext secret is returned once');
  assert.ok(res.body.credentials.warning.includes('not be shown again'));
});

test('reports API_UNREACHABLE when probe fails', async () => {
  // Override axios with a failing GET
  stubs.set('axios', {
    get:  async () => { throw new Error('connect refused'); },
    post: async () => ({ status: 201, data: { clientId: 'cid', clientSecret: 'csec' } })
  });
  // Re-require to pick up stub change
  delete require.cache[require.resolve('../src/controllers/providerController')];
  const ctrl2 = require('../src/controllers/providerController');

  const res = mockRes();
  await ctrl2.register({
    body: { companyName: 'Co', contactEmail: 'b@b.c', apiBaseUrl: 'http://nope', apiKey: 'k' },
    user: null
  }, res);
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.body.error, 'API_UNREACHABLE');
});
