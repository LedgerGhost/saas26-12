const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

const requireUser = (req, res, next) => {
  if (!req.user?.id) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  next();
};

router.get('/', invoiceController.list);
router.get('/:invoiceId', invoiceController.get);
router.post('/draft-month', requireUser, invoiceController.draftCurrentMonth);
router.post('/checkout-session', invoiceController.createCheckoutSession);

// Webhook must be raw body depending on how your app.js is configured
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), invoiceController.handleStripeWebhook);

module.exports = router;
