const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyToken } = require('@saasplug/shared-utils');

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

/** POST /api/auth/google/callback   body: { idToken } */
exports.googleCallback = async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(503).json({ error: 'GOOGLE_OAUTH_NOT_CONFIGURED' });
    }
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'MISSING_ID_TOKEN' });

    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();

    const user = await User.findOneAndUpdate(
      { googleId: payload.sub },
      {
        googleId: payload.sub,
        email:    payload.email,
        name:     payload.name,
        picture:  payload.picture,
        lastLogin: new Date()
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json(issueTokenPair(user));
  } catch (err) {
    console.error('[auth] googleCallback:', err.message);
    res.status(401).json({ error: 'GOOGLE_AUTH_FAILED', message: err.message });
  }
};

/** POST /api/auth/refresh   body: { refreshToken } */
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'MISSING_REFRESH_TOKEN' });

    const payload = verifyToken(refreshToken);
    if (payload.type !== 'refresh') return res.status(400).json({ error: 'NOT_A_REFRESH_TOKEN' });

    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'USER_INACTIVE' });

    res.json(issueTokenPair(user));
  } catch (err) {
    res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: err.message });
  }
};

/** GET /api/auth/me */
exports.me = async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'INVALID_TOKEN', message: err.message });
  }
};

/**
 * POST /api/auth/dev-login  body: { email, name?, role? }
 * Creates/returns a user without Google. Useful for local demos and integration tests.
 * In a real deployment, gate behind NODE_ENV !== 'production'.
 */
exports.devLogin = async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_LOGIN !== 'true') {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  try {
    const { email, name, role } = req.body;
    if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { email, name: name || email.split('@')[0], role: role || 'ev_user', lastLogin: new Date() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(issueTokenPair(user));
  } catch (err) {
    res.status(400).json({ error: 'DEV_LOGIN_FAILED', message: err.message });
  }
};

/**
 * POST /api/auth/credentials
 * Internal endpoint called by provider-service during registration.
 * Generates a random {clientId, clientSecret} pair for a provider.
 * Authenticated via x-internal-token header (shared secret between services).
 */
exports.issueCredentials = async (req, res) => {
  const expected = process.env.INTERNAL_AUTH_TOKEN;
  const got = req.headers['x-internal-token'];
  if (!expected || got !== expected) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Internal endpoint' });
  }
  const clientId     = 'cid_' + crypto.randomBytes(12).toString('hex');
  const clientSecret = 'csec_' + crypto.randomBytes(24).toString('hex');
  res.status(201).json({ clientId, clientSecret });
};

/** GET /api/auth/users?page=&limit=&search=&role= */
exports.listUsers = async (req, res) => {
  if (req.user?.role !== 'operator') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'operator role required' });
  }
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const filter = {};
    if (req.query.search) {
      const re = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ email: re }, { name: re }];
    }
    if (req.query.role) filter.role = req.query.role;
    const [users, total] = await Promise.all([
      User.find(filter).sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter)
    ]);
    res.json({ users, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'LIST_FAILED', message: err.message });
  }
};

/** PATCH /api/auth/users/:id/role   body: { role } */
exports.assignRole = async (req, res) => {
  if (req.user?.role !== 'operator') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'operator role required' });
  }
  const { role } = req.body;
  const VALID = ['ev_user', 'provider', 'operator'];
  if (!VALID.includes(role)) {
    return res.status(400).json({ error: 'INVALID_ROLE', message: `role must be one of: ${VALID.join(', ')}` });
  }
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'SELF_DEMOTION', message: 'You cannot change your own role' });
  }
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'ASSIGN_FAILED', message: err.message });
  }
};

/** POST /api/auth/internal/set-role   body: { userId, role }  (service-to-service) */
exports.setRoleInternal = async (req, res) => {
  const expected = process.env.INTERNAL_AUTH_TOKEN;
  const got = req.headers['x-internal-token'];
  if (!expected || got !== expected) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Internal endpoint' });
  }
  const { userId, role } = req.body;
  const VALID = ['ev_user', 'provider', 'operator'];
  if (!userId || !VALID.includes(role)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'userId and valid role required' });
  }
  try {
    const user = await User.findByIdAndUpdate(userId, { role }, { new: true });
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    res.json({ ok: true, role: user.role });
  } catch (err) {
    res.status(400).json({ error: 'SET_ROLE_FAILED', message: err.message });
  }
};

/** GET /api/auth/bootstrap/status */
exports.bootstrapStatus = async (_req, res) => {
  try {
    const count = await User.countDocuments({ role: 'operator' });
    res.json({ needed: count === 0 });
  } catch (err) {
    res.status(500).json({ error: 'STATUS_CHECK_FAILED', message: err.message });
  }
};

/**
 * POST /api/auth/bootstrap   body: { idToken } | { email, name } (dev only)
 * Creates the first operator. Returns 409 if an operator already exists.
 */
exports.bootstrap = async (req, res) => {
  try {
    const existing = await User.findOne({ role: 'operator' });
    if (existing) {
      return res.status(409).json({ error: 'ALREADY_BOOTSTRAPPED', message: 'An operator already exists. Use normal sign-in.' });
    }

    if (req.body.idToken) {
      if (!googleClient) return res.status(503).json({ error: 'GOOGLE_OAUTH_NOT_CONFIGURED' });
      const ticket = await googleClient.verifyIdToken({ idToken: req.body.idToken, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const user = await User.findOneAndUpdate(
        { googleId: payload.sub },
        { googleId: payload.sub, email: payload.email, name: payload.name, picture: payload.picture, role: 'operator', lastLogin: new Date() },
        { new: true, upsert: true }
      );
      return res.json(issueTokenPair(user));
    }

    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_LOGIN !== 'true') {
      return res.status(400).json({ error: 'GOOGLE_REQUIRED', message: 'Google sign-in is required in production' });
    }
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { email, name: name || email.split('@')[0], role: 'operator', lastLogin: new Date() },
      { new: true, upsert: true }
    );
    return res.json(issueTokenPair(user));
  } catch (err) {
    console.error('[auth] bootstrap:', err.message);
    res.status(500).json({ error: 'BOOTSTRAP_FAILED', message: err.message });
  }
};

function issueTokenPair(user) {
  const claims = { sub: user._id.toString(), email: user.email, role: user.role };
  return {
    accessToken: signAccessToken(claims),
    refreshToken: signRefreshToken({ sub: claims.sub }),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    user
  };
}
