const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/stationsController');

// UC01: GET /api/stations?lat&lng&radius&status&providerId
router.get('/', ctrl.searchStations);

// UC01: GET /api/stations/:stationId   (also fires a 'click' event)
router.get('/:stationId', ctrl.getStationDetail);

module.exports = router;
