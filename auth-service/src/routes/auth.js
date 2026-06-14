const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');

// UC00 — Google OAuth callback (POST with code)
router.post('/google/callback', ctrl.googleCallback);

// Refresh access token
router.post('/refresh', ctrl.refresh);

// Inspect current user (using access token)
router.get('/me', ctrl.me);

// Dev-only convenience login (disabled in production)
router.post('/dev-login', ctrl.devLogin);

// Internal — generates client credentials for a registering provider
router.post('/credentials', ctrl.issueCredentials);

module.exports = router;
