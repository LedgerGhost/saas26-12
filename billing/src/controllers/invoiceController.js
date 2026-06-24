const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { publish } = require('@saasplug/shared-utils');
const Invoice = require('../models/Invoice');
const Charge = require('../models/Charge');
const Payment = require('../models/Payment');

async function resolveProviderId(req) {
  if (req.user?.role === 'operator' && req.query.providerId) return req.query.providerId;
  const base = process.env.PROVIDER_SERVICE_URL;
  if (!base || !req.user?.id) return null;
  try {
    const r = await axios.get(`${base}/api/providers/by-user/${encodeURIComponent(req.user.id)}`, {
      timeout: 5_000,
      headers: { 'x-internal-token': process.env.INTERNAL_AUTH_TOKEN || '' }
    });
    return r.data?.providerSystemId || null;
  } catch (err) {
    return null;
  }
}

// Resolve which provider a write (create-invoice) targets.
// Operators name the provider explicitly; providers can only act on themselves.
async function resolveTargetProviderId(req) {
  if (req.user?.role === 'operator') {
    const id = req.body?.providerId || req.query.providerId;
    return id ? String(id).trim() : null;
  }
  return resolveProviderId(req);
}

// Group charges into one invoice line item per calendar day: the day's
// reservation count (quantity), the summed subtotal, and the derived unit price.
// Pure + exported so it can be unit-tested without a DB.
function rollupLineItems(charges = []) {
  const byDay = new Map();
  for (const c of charges) {
    const ts = c.createdAt || c.created_at || c.endTime || new Date();
    const day = new Date(ts).toISOString().slice(0, 10);
    const row = byDay.get(day) || { quantity: 0, subtotal: 0 };
    row.quantity += 1;
    row.subtotal += (c.amount || 0);
    byDay.set(day, row);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, r]) => {
      const subtotal = +r.subtotal.toFixed(2);
      return {
        description: `Reservations on ${day}`,
        quantity: r.quantity,
        unitPrice: +(subtotal / r.quantity).toFixed(4),
        subtotal
      };
    });
}
exports.rollupLineItems = rollupLineItems;

exports.list = async (req, res) => {
  const providerId = await resolveProviderId(req);
  if (!providerId) return res.status(404).json({ error: 'PROVIDER_NOT_FOUND' });
  const invoices = await Invoice.find({ providerId }).sort({ issuedAt: -1 }).limit(200).lean();
  res.json({ providerId, invoices });
};

exports.get = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId).lean();
    if (!invoice) return res.status(404).json({ error: 'NOT_FOUND' });
    const callerProvider = await resolveProviderId(req);
    const isOperator = req.user?.role === 'operator';
    if (!isOperator && callerProvider !== invoice.providerId) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: 'BAD_ID', message: err.message });
  }
};

// GET /api/invoices/billable
// Returns the not-yet-invoiced reservation charges, summed per provider.
// Operators get every provider (or a single one via ?providerId=); a provider
// only ever sees their own outstanding total. This is what feeds the operator's
// "Create Invoice" screen — the sum of all reservations made for the provider.
exports.billableSummary = async (req, res) => {
  const isOperator = req.user?.role === 'operator';
  const match = { invoicedAt: null };

  if (isOperator) {
    if (req.query.providerId) match.providerId = String(req.query.providerId).trim();
  } else {
    const providerId = await resolveProviderId(req);
    if (!providerId) return res.status(404).json({ error: 'PROVIDER_NOT_FOUND' });
    match.providerId = providerId;
  }

  try {
    const rows = await Charge.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$providerId',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          currency: { $first: '$currency' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    const providers = rows.map(r => ({
      providerId: r._id,
      total: +(r.total || 0).toFixed(2),
      count: r.count,
      currency: r.currency || 'EUR'
    }));
    const total = +providers.reduce((s, p) => s + p.total, 0).toFixed(2);

    res.json({ scope: isOperator ? 'global' : 'own', providers, total });
  } catch (err) {
    res.status(500).json({ error: 'BILLABLE_FAILED', message: err.message });
  }
};

// POST /api/invoices/create   body (operator): { providerId }
// Issues a single invoice covering ALL outstanding reservation charges for a
// provider. Operators pick the provider; providers self-bill their own charges.
// The invoice is created as ISSUED (immediately payable) and appears on the
// provider's Invoices page.
exports.createInvoice = async (req, res) => {
  const providerId = await resolveTargetProviderId(req);
  if (!providerId) {
    return req.user?.role === 'operator'
      ? res.status(400).json({ error: 'PROVIDER_ID_REQUIRED', message: 'Select a provider to invoice.' })
      : res.status(404).json({ error: 'PROVIDER_NOT_FOUND' });
  }

  try {
    const now = new Date();
    const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 14); // Due 14th of next month

    // Mint the invoice _id locally, then CLAIM the outstanding charges by stamping
    // that id atomically. The `invoicedAt: null` filter means a concurrent create
    // — or the billing cron — can never grab the same charge twice, without a
    // transaction (standalone Mongo can't run them). Nothing claimed ⇒ nothing to bill.
    const invoice = new Invoice({
      providerId, billingPeriod, totalAmount: 0, currency: 'EUR',
      issuedAt: now, dueDate, status: 'ISSUED'
    });

    const claim = await Charge.updateMany(
      { providerId, invoicedAt: null },
      { $set: { invoiceId: invoice._id.toString(), invoicedAt: now } }
    );
    if (!claim.modifiedCount) {
      return res.status(200).json({ empty: true, message: 'No outstanding reservations to invoice for this provider.' });
    }

    const charges = await Charge.find({ invoiceId: invoice._id.toString() });
    invoice.totalAmount = +charges.reduce((acc, c) => acc + c.amount, 0).toFixed(2);
    invoice.currency = charges[0].currency || 'EUR';
    invoice.reservations = charges.map(c => ({
      reservationId: c.reservationId,
      pointId: c.stationId || 'Unknown Point',
      timestamp: c.endTime || c.created_at || c.createdAt || new Date(),
      charge: c.amount
    }));
    invoice.lineItems = rollupLineItems(charges);
    await invoice.save();

    publish('invoice.issued', {
      invoiceId: invoice._id.toString(),
      providerId: invoice.providerId,
      amount: invoice.totalAmount,
      currency: invoice.currency,
      ts: new Date().toISOString()
    }).catch(e => console.warn('[billing-service] publish invoice.issued failed:', e.message));

    res.status(201).json({ message: 'Invoice issued.', invoice });
  } catch (err) {
    console.error('[billing-service] createInvoice failed:', err);
    res.status(500).json({ error: 'CREATE_FAILED', message: err.message });
  }
};


// MANUAL BUTTON: Drafts an invoice for the CURRENT MONTH. Sets status to PENDING.
exports.draftCurrentMonth = async (req, res) => {
  const providerId = await resolveProviderId(req);
  if (!providerId) return res.status(404).json({ error: 'PROVIDER_NOT_FOUND' });

  const now = new Date();
  // Get the 1st day of the current month at 00:00:00
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    const charges = await Charge.find({ providerId, invoicedAt: null, created_at: { $gte: startOfMonth } });
    if (charges.length === 0) {
      return res.status(200).json({ empty: true, message: 'No new charges this month to draft.' });
    }

    let invoice = await Invoice.findOne({ providerId, billingPeriod: currentMonthStr, status: 'PENDING' });
    
    const sum = charges.reduce((acc, c) => acc + c.amount, 0);
    const currency = charges[0].currency;
    const newReservations = charges.map(c => ({
      reservationId: c.reservationId,
      pointId: c.stationId || 'Unknown Point',
      timestamp: c.endTime || c.created_at || c.createdAt || new Date(),
      charge: c.amount
    }));

    if (invoice) {
      invoice.totalAmount += sum;
      invoice.reservations.push(...newReservations);
      await invoice.save();
    } else {
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 14); // Due 14th of next month
      invoice = await Invoice.create({
        providerId, billingPeriod: currentMonthStr, totalAmount: +sum.toFixed(2), currency, dueDate, reservations: newReservations, status: 'PENDING'
      });
    }

    await Charge.updateMany(
      { _id: { $in: charges.map(c => c._id) } },
      { $set: { invoiceId: invoice._id.toString(), invoicedAt: new Date() } }
    );

    res.status(201).json({ message: `Current month's draft updated.`, invoice });
  } catch (err) {
    console.error('[billing-service] draft failed:', err);
    res.status(500).json({ error: 'DRAFT_FAILED', message: err.message });
  }
};

// CRON JOB: Converts past PENDING to ISSUED. 
// Sweeps unbilled charges into existing drafts, then locks past months to ISSUED.
// This is needed in case the draft button was not pressed or there were pending invoices from previous months.
exports.runAutomatedBilling = async () => {
  console.log('[billing-service] Running automated monthly billing cycle...');
  try {
    const now = new Date();
    // Get 00:00:00 of the 1st day of the current month
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // STEP 1: Catch unbilled charges from PAST months.
    // If the provider manually drafted early in the month, append to that draft.
    const unbilledPastCharges = await Charge.find({ 
      invoicedAt: null, 
      created_at: { $lt: startOfCurrentMonth } 
    });

    if (unbilledPastCharges.length > 0) {
      const byProviderAndMonth = new Map();
      for (const c of unbilledPastCharges) {
        const dateObj = c.endTime ? new Date(c.endTime) : new Date(c.created_at || c.createdAt);
        const monthStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        
        const key = `${c.providerId}_${monthStr}`;
        if (!byProviderAndMonth.has(key)) byProviderAndMonth.set(key, []);
        byProviderAndMonth.get(key).push(c);
      }

      for (const [key, monthCharges] of byProviderAndMonth.entries()) {
        const providerId = monthCharges[0].providerId;
        const billingPeriod = key.split('_')[1];
        
        const total = monthCharges.reduce((s, c) => s + c.amount, 0);
        const currency = monthCharges[0].currency;
        const newReservations = monthCharges.map(c => ({
          reservationId: c.reservationId, 
          pointId: c.stationId || 'Unknown Point', 
          timestamp: c.endTime || c.created_at || c.createdAt, 
          charge: c.amount
        }));

        // Check if the provider already drafted an invoice this month
        let invoice = await Invoice.findOne({ providerId, billingPeriod, status: 'PENDING' });

        if (invoice) {
          // Merge these forgotten charges into the existing draft
          invoice.totalAmount += total;
          invoice.reservations.push(...newReservations);
          await invoice.save();
        } else {
          // Create a new draft (which will be locked immediately in Step 2)
          const invoiceYear = parseInt(billingPeriod.split('-')[0]);
          const invoiceMonth = parseInt(billingPeriod.split('-')[1]); 
          const dueDate = new Date(invoiceYear, invoiceMonth, 14); 

          invoice = await Invoice.create({
            providerId, 
            billingPeriod, 
            totalAmount: +total.toFixed(2), 
            currency, 
            dueDate, 
            reservations: newReservations, 
            status: 'PENDING'
          });
        }

        // Mark charges as billed
        await Charge.updateMany(
          { _id: { $in: monthCharges.map(c => c._id) } }, 
          { $set: { invoiceId: invoice._id.toString(), invoicedAt: new Date() } }
        );
      }
    }

    // STEP 2: Lock ALL past PENDING invoices (Drafts) into official ISSUED status
    const pendingInvoices = await Invoice.find({ status: 'PENDING', billingPeriod: { $lt: currentMonthStr } });
    for (const inv of pendingInvoices) {
      inv.status = 'ISSUED';
      await inv.save();
      
      publish('invoice.issued', {
        invoiceId: inv._id.toString(), providerId: inv.providerId, amount: inv.totalAmount, currency: inv.currency, ts: new Date().toISOString()
      }).catch(e => console.warn('Publish failed:', e.message));
      
      console.log(`[billing-service] Locked drafted invoice ${inv._id} to ISSUED.`);
    }

  } catch (err) {
    console.error('[billing-service] Automated billing error:', err);
  }
};

exports.createCheckoutSession = async (req, res) => {
  try {
    const { invoiceId, successUrl, cancelUrl } = req.body;
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'NOT_FOUND' });
    if (invoice.status === 'PAID') return res.status(409).json({ error: 'ALREADY_PAID' });
    if (invoice.status === 'VOID') return res.status(409).json({ error: 'INVOICE_VOID' });
    if (invoice.status === 'PENDING') return res.status(409).json({ error: 'INVOICE_PENDING', message: 'Draft invoices cannot be paid until the month concludes.' });

    const gatewayUrl = (process.env.PAYMENTS_SERVICE_URL || 'http://payments:5008') + '/create-checkout-session';
    const r = await axios.post(gatewayUrl, { amount: invoice.totalAmount, currency: invoice.currency, invoiceId: invoice._id.toString(), successUrl, cancelUrl }, { timeout: 10_000 });
    res.status(200).json({ url: r.data.url });
  } catch (err) {
    res.status(500).json({ error: 'SESSION_FAILED', message: err.response?.data?.message || err.message });
  }
};

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = session.metadata.invoiceId;
    try {
      const invoice = await Invoice.findById(invoiceId);
      if (invoice && invoice.status !== 'PAID') {
        invoice.status = 'PAID';
        await invoice.save();
        await Payment.create({ invoiceId: invoice._id.toString(), providerId: invoice.providerId, amount: invoice.totalAmount, currency: invoice.currency, status: 'APPROVED', gatewayRef: session.id });
        publish('payment.completed', { invoiceId: invoice._id.toString(), providerId: invoice.providerId, amount: invoice.totalAmount, currency: invoice.currency, gatewayRef: session.id, ts: new Date().toISOString() }).catch(() => {});
      }
    } catch (err) {
      return res.status(500).json({ error: 'WEBHOOK_PROCESSING_FAILED' }); 
    }
  }
  res.json({ received: true });
};