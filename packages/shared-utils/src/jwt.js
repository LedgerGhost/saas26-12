const jwt = require('jsonwebtoken');

function signAccessToken(payload, secret = process.env.JWT_SECRET, expiresIn = process.env.JWT_EXPIRES_IN || '15m') {
  return jwt.sign(payload, secret, { expiresIn });
}

function signRefreshToken(payload, secret = process.env.JWT_SECRET, expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d') {
  return jwt.sign({ ...payload, type: 'refresh' }, secret, { expiresIn });
}

function verifyToken(token, secret = process.env.JWT_SECRET) {
  return jwt.verify(token, secret);
}

/**
 * Express middleware that:
 *  - reads Authorization: Bearer <token>
 *  - verifies signature
 *  - sets req.user = { id, email, role }
 *  - 401 on missing/invalid
 *
 * `requiredRole` is optional; pass 'operator' or 'provider' to gate.
 */
function authMiddleware(requiredRole = null) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing Bearer token' });
    }
    try {
      const payload = verifyToken(token);
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: 'FORBIDDEN', message: `Role '${requiredRole}' required` });
      }
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: err.message });
    }
  };
}

/**
 * Reads user info from x-user-* headers injected by the API gateway.
 * Use this in downstream services that sit behind the gateway on the
 * docker network and don't need to re-verify the JWT signature.
 */
function userFromGatewayHeaders(req, _res, next) {
  const id = req.headers['x-user-id'];
  const email = req.headers['x-user-email'];
  const role = req.headers['x-user-role'];
  req.user = id ? { id, email, role } : null;
  next();
}

module.exports = { signAccessToken, signRefreshToken, verifyToken, authMiddleware, userFromGatewayHeaders };
