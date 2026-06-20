const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reservationController');

// UC02 — create reservation (requires auth via gateway)
router.post('/', ctrl.requireUser, ctrl.create);

// list own reservations
router.get('/', ctrl.requireUser, ctrl.listMine);

// cancel own active reservation
router.post('/:id/cancel', ctrl.requireUser, ctrl.cancel);

// single reservation status
router.get('/:id', ctrl.requireUser, ctrl.getOne);

module.exports = router;
