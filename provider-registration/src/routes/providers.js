const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/providerController');

// List all providers (safe fields — no API keys)
router.get('/', ctrl.list);

// Discover active connectors from the orchestrator and cross-reference with the DB
router.get('/discover', ctrl.discover);

// UC03 — registration (public; gateway leaves /api/providers unprotected)
router.post('/', ctrl.register);

// Internal — analytics-service uses this to translate userId -> providerId
router.get('/by-user/:userId', ctrl.getByUser);

// Internal — reservation-service uses this to translate a stationId's prefix
// (e.g. "redPlug") into the Provider record so it can read pricing.
router.get('/by-system/:providerSystemId', ctrl.getBySystem);

// Operator assigns a user to a provider scope
router.patch('/:providerId/assign-user', ctrl.assignUser);

// Read / update
router.get('/:providerId', ctrl.get);
router.put('/:providerId', ctrl.update);

module.exports = router;
