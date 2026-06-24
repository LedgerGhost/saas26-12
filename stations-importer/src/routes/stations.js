const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/stationsController');

// UC01: GET /api/stations?lat&lng&radius&status&providerId
router.get('/', ctrl.searchStations);

// Provider station management
router.get('/provider/mine', ctrl.listProviderStations);
router.patch('/provider/:stationId/status', ctrl.updateProviderStationStatus);

// UC01: GET /api/stations/:stationId   (also fires a 'click' event)
router.get('/:stationId', ctrl.getStationDetail);

module.exports = router;
