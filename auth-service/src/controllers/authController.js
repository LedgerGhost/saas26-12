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

function issueTokenPair(user) {
  const claims = { sub: user._id.toString(), email: user.email, role: user.role };
  return {
    accessToken: signAccessToken(claims),
    refreshToken: signRefreshToken({ sub: claims.sub }),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    user
  };
}
