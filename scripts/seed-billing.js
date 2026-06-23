#!/usr/bin/env node
/**
 * saasPlug billing seed — PAYABLE invoices only
 * ---------------------------------------------
 * Creates real, UNPAID `ISSUED` invoices so the provider "Recent invoices"
 * panel has something to show AND something you can actually pay through the
 * live Stripe Checkout flow.
 *
 * It deliberately does NOT seed Payments or PAID invoices: in the real system
 * an invoice only becomes PAID when Stripe's signature-verified webhook
 * (checkout.session.completed) fires and writes the Payment row itself. Faking
 * that would bypass Stripe and make the status untrustworthy — which is exactly
 * what we want to test end-to-end instead.
 *
 * Run inside the docker network (mongo ports are not published to host):
 *
 *   docker compose run --rm --no-deps \
 *     -v "$PWD/scripts:/seed" \
 *     billing-service node /seed/seed-billing.js
 *
 * Override PROVIDER / MONGO_URI via env. Pass WIPE=1 to clear these invoices first.
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo-billingdb:27017/billing';
const PROVIDER = process.env.PROVIDER || 'redPlug';

const invoiceSchema = new mongoose.Schema({
  providerId:    { type: String, required: true, index: true },
  billingPeriod: { type: String },
  issuedAt:      { type: Date, default: Date.now },
  dueDate:       { type: Date },
  totalAmount:   { type: Number, required: true },
  currency:      { type: String, default: 'EUR' },
  status:        { type: String, default: 'PENDING', index: true },
  lineItems:     { type: Array, default: [] },
  reservations:  { type: Array, default: [] }
}, { collection: 'invoices', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const Invoice = mongoose.model('Invoice', invoiceSchema);

// A few real UNPAID invoices to test Stripe payment against. All ISSUED, none PAID.
const ROWS = [
  { period: '2026-03', amount: 1390.10 },
  { period: '2026-04', amount: 1102.30 },
  { period: '2026-05', amount: 1284.50 }
];

async function main() {
  console.log('[seed-billing] connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  if (process.env.WIPE === '1') {
    const di = await Invoice.deleteMany({
      providerId: PROVIDER,
      'reservations.0': { $exists: false },          // only the empty seeded ones
      billingPeriod: { $in: ROWS.map(r => r.period) }
    });
    console.log(`[seed-billing] wiped ${di.deletedCount} seeded invoices`);
  }

  for (const row of ROWS) {
    const [y, m] = row.period.split('-').map(Number);
    const issuedAt = new Date(y, m - 1, 28, 9, 0, 0);
    const dueDate  = new Date(y, m, 14);

    const invoice = await Invoice.create({
      providerId: PROVIDER,
      billingPeriod: row.period,
      totalAmount: row.amount,
      currency: 'EUR',
      status: 'ISSUED',          // payable; flips to PAID only via the Stripe webhook
      issuedAt,
      dueDate,
      reservations: []
    });
    console.log(`   ✓ ${row.period}  €${row.amount.toFixed(2)}  ISSUED (unpaid)  (${invoice._id})`);
  }

  await mongoose.disconnect();
  console.log('[seed-billing] done. Pay one from the Invoices page to test the Stripe flow.');
}

main().catch(err => { console.error('[seed-billing] failed:', err); process.exit(1); });
