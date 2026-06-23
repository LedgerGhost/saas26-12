const axios = require('axios');
const bcrypt = require('bcryptjs');
const Provider = require('../models/Provider');

/**
 * POST /api/providers
 * Body: { companyName, contactEmail, apiBaseUrl, apiKey, pricingPlan? }
 * Flow (per SRS Seq-04):
 *  1) validate input
 *  2) connectivity check against apiBaseUrl/points
 *  3) persist provider
 *  4) call auth-service to mint clientId/clientSecret
 *  5) hash clientSecret, store, return plaintext once
 */
exports.register = async (req, res) => {
  try {
    const {
      companyName, contactEmail, apiBaseUrl, apiKey, pricingPlan,
      providerSystemId, ratePerReservation, skipConnectivityCheck
    } = req.body || {};
    if (!companyName || !contactEmail || !apiBaseUrl) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'companyName, contactEmail and apiBaseUrl are required'
      });
    }
    if (!skipConnectivityCheck && !apiKey) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'apiKey is required unless skipConnectivityCheck is true'
      });
    }
    if (pricingPlan && !Provider.PRICING_PLANS.includes(pricingPlan)) {
      return res.status(400).json({
        error: 'INVALID_PRICING_PLAN',
        message: `pricingPlan must be one of: ${Provider.PRICING_PLANS.join(', ')}`
      });
    }
    if (ratePerReservation != null && (typeof ratePerReservation !== 'number' || ratePerReservation < 0)) {
      return res.status(400).json({ error: 'INVALID_RATE', message: 'ratePerReservation must be a non-negative number' });
    }
    if (await Provider.exists({ contactEmail: contactEmail.toLowerCase().trim() })) {
      return res.status(409).json({ error: 'PROVIDER_EXISTS', message: 'A provider with this email is already registered' });
    }

    // 2) connectivity check (skipped for connector-discovered registrations)
    if (!skipConnectivityCheck) {
      try {
        const probeUrl = apiBaseUrl.replace(/\/+$/, '') + '/points';
        await axios.get(probeUrl, {
          timeout: 10_000,
          headers: apiKey ? { 'x-api-key': apiKey } : {},
          validateStatus: s => s < 500
        });
      } catch (err) {
        return res.status(502).json({
          error: 'API_UNREACHABLE',
          message: `Could not reach provider API at ${apiBaseUrl}: ${err.message}`
        });
      }
    }

    // 3) persist (without credentials yet)
    const provider = await Provider.create({
      companyName,
      contactEmail,
      apiBaseUrl,
      apiKey,
      providerSystemId: providerSystemId ? String(providerSystemId).trim() : undefined,
      ratePerReservation: ratePerReservation != null ? ratePerReservation : undefined,
      pricingPlan: pricingPlan || 'basic',
      userId: req.user?.id || null
    });

    // 4) mint credentials via auth-service
    let credentials;
    try {
      const url = (process.env.AUTH_SERVICE_URL || 'http://auth-service:5001') + '/api/auth/credentials';
      const r = await axios.post(url, { providerId: provider._id.toString() }, {
        timeout: 10_000,
        headers: { 'x-internal-token': process.env.INTERNAL_AUTH_TOKEN || '' }
      });
      credentials = r.data; // { clientId, clientSecret }
    } catch (err) {
      // rollback the partial provider on credential-issuance failure
      await Provider.deleteOne({ _id: provider._id });
      return res.status(502).json({
        error: 'CREDENTIAL_ISSUE_FAILED',
        message: `auth-service did not issue credentials: ${err.response?.data?.message || err.message}`
      });
    }

    // 5) hash + store
    provider.clientId = credentials.clientId;
    provider.clientSecretHash = await bcrypt.hash(credentials.clientSecret, 10);
    await provider.save();

    // Return plaintext secret ONCE
    return res.status(201).json({
      provider,
      credentials: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        warning: 'Store the clientSecret securely — it will not be shown again.'
      }
    });
  } catch (err) {
    console.error('[provider-service] register:', err);
    res.status(500).json({ error: 'REGISTRATION_FAILED', message: err.message });
  }
};

/**
 * GET /api/providers/discover
 * Calls the orchestrator for all configured connectors, then cross-references
 * the Provider collection so the UI knows which are already registered.
 */
exports.discover = async (req, res) => {
  try {
    const orchUrl = (process.env.ORCHESTRATOR_URL || 'http://provider-orchestrator:5007') + '/connectors';
    const r = await axios.get(orchUrl, { timeout: 8_000 });
    const connectors = r.data.connectors || [];

    const registeredIds = await Provider.distinct('providerSystemId');
    const registered = new Set(registeredIds.filter(Boolean));

    res.json({
      connectors: connectors.map(c => ({ ...c, registered: registered.has(c.providerSystemId) }))
    });
  } catch (err) {
    res.status(502).json({ error: 'DISCOVER_FAILED', message: err.message });
  }
};

/** GET /api/providers — list all (safe fields only, no API keys) */
exports.list = async (req, res) => {
  try {
    const providers = await Provider.find({})
      .select('-apiKey -clientSecretHash')
      .sort({ companyName: 1 });
    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: 'LIST_FAILED', message: err.message });
  }
};

/** PATCH /api/providers/:providerId/assign-user   body: { userId }  (operator only) */
exports.assignUser = async (req, res) => {
  if (req.user?.role !== 'operator') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'operator role required' });
  }
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
  try {
    const provider = await Provider.findByIdAndUpdate(
      req.params.providerId, { userId }, { new: true }
    );
    if (!provider) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
      const url = (process.env.AUTH_SERVICE_URL || 'http://auth-service:5001') + '/api/auth/internal/set-role';
      await axios.post(url, { userId, role: 'provider' }, {
        timeout: 5_000,
        headers: { 'x-internal-token': process.env.INTERNAL_AUTH_TOKEN || '' }
      });
    } catch (e) {
      console.warn('[provider-service] assign-user role grant non-fatal:', e.message);
    }
    res.json(provider);
  } catch (err) {
    res.status(400).json({ error: 'ASSIGN_FAILED', message: err.message });
  }
};

/** GET /api/providers/:providerId */
exports.get = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.providerId);
    if (!provider) return res.status(404).json({ error: 'NOT_FOUND', message: 'Provider not found' });
    res.json(provider);
  } catch (err) {
    res.status(400).json({ error: 'BAD_ID', message: err.message });
  }
};

/** PUT /api/providers/:providerId */
exports.update = async (req, res) => {
  try {
    const allowed = [
      'companyName', 'contactEmail', 'apiBaseUrl', 'apiKey',
      'pricingPlan', 'ratePerReservation', 'ratePerSearch',
      'providerSystemId', 'status'
    ];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

    const provider = await Provider.findByIdAndUpdate(req.params.providerId, patch, { new: true, runValidators: true });
    if (!provider) return res.status(404).json({ error: 'NOT_FOUND', message: 'Provider not found' });
    res.json(provider);
  } catch (err) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: err.message });
  }
};

/**
 * GET /api/providers/by-system/:providerSystemId
 * Internal lookup (or unauthenticated public read of non-sensitive pricing fields)
 * so reservation-service can map "redPlug" -> Provider record for pricing.
 * Returns only the fields callers actually need.
 */
exports.getBySystem = async (req, res) => {
  try {
    const provider = await Provider.findOne({ providerSystemId: req.params.providerSystemId });
    if (!provider) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({
      _id: provider._id.toString(),
      providerSystemId: provider.providerSystemId,
      companyName: provider.companyName,
      ratePerReservation: provider.ratePerReservation,
      ratePerSearch: provider.ratePerSearch,
      pricingPlan: provider.pricingPlan,
      status: provider.status
    });
  } catch (err) {
    res.status(400).json({ error: 'LOOKUP_FAILED', message: err.message });
  }
};

/**
 * GET /api/providers/by-user/:userId
 * Lookup so analytics-service can resolve req.user.id -> providerId.
 * Accepts either:
 *   - x-internal-token header (service-to-service), OR
 *   - the calling user IS the userId being looked up (so the frontend can fetch own provider)
 */
exports.getByUser = async (req, res) => {
  const expectedInternal = process.env.INTERNAL_AUTH_TOKEN;
  const gotInternal = req.headers['x-internal-token'];
  const isInternal = expectedInternal && gotInternal === expectedInternal;
  const isSelf = req.user?.id && req.user.id === req.params.userId;

  if (!isInternal && !isSelf) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not allowed to look up other users' });
  }
  try {
    const provider = await Provider.findOne({ userId: req.params.userId });
    if (!provider) return res.status(404).json({ error: 'NOT_FOUND', message: 'No provider for this user' });
    res.json(provider);
  } catch (err) {
    res.status(400).json({ error: 'LOOKUP_FAILED', message: err.message });
  }
};
