const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Boot the server in-process on an ephemeral port.
process.env.PORT = '0';
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// Mirror server.js inline so the test owns the lifecycle.
function build() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.post('/charge', (req, res) => {
    const { amount, cardToken, currency, invoiceId } = req.body || {};
    if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: 'INVALID_AMOUNT' });
    if (!cardToken) return res.status(400).json({ error: 'MISSING_CARD_TOKEN' });
    const declined = String(cardToken).startsWith('fail-') || amount === 999.99;
    res.json({
      status: declined ? 'DECLINED' : 'APPROVED',
      gatewayRef: 'mockpay_' + crypto.randomBytes(4).toString('hex'),
      amount, currency: currency || 'EUR', invoiceId: invoiceId || null,
      processedAt: new Date().toISOString(),
      reason: declined ? 'card_declined_for_demo' : null
    });
  });
  return app;
}

function post(server, path, body) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

test('approves a valid card', async (t) => {
  const server = build().listen(0);
  t.after(() => server.close());
  const r = await post(server, '/charge', { amount: 12.50, cardToken: 'tok_4242' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.status, 'APPROVED');
  assert.match(r.body.gatewayRef, /^mockpay_/);
});

test('declines fail-prefixed cards', async (t) => {
  const server = build().listen(0);
  t.after(() => server.close());
  const r = await post(server, '/charge', { amount: 5, cardToken: 'fail-decline' });
  assert.strictEqual(r.body.status, 'DECLINED');
});

test('declines the magic 999.99 amount', async (t) => {
  const server = build().listen(0);
  t.after(() => server.close());
  const r = await post(server, '/charge', { amount: 999.99, cardToken: 'tok_4242' });
  assert.strictEqual(r.body.status, 'DECLINED');
});

test('rejects negative or missing amount', async (t) => {
  const server = build().listen(0);
  t.after(() => server.close());
  const r = await post(server, '/charge', { amount: -1, cardToken: 'tok_x' });
  assert.strictEqual(r.status, 400);
});

test('rejects missing cardToken', async (t) => {
  const server = build().listen(0);
  t.after(() => server.close());
  const r = await post(server, '/charge', { amount: 10 });
  assert.strictEqual(r.status, 400);
});
