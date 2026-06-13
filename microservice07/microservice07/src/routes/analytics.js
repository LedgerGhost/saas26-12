const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analyticsController');

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user?.id) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN', need: roles });
  next();
};

// UC04 — provider's own analytics
router.get('/',        requireRole('provider'),  ctrl.ownAnalytics);

// UC06 — global analytics (operator only)
router.get('/global',  requireRole('operator'),  ctrl.globalAnalytics);

// UC08 — log export
router.post('/export', requireRole('provider', 'operator'), ctrl.exportLogs);

module.exports = router;
