const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { userFromGatewayHeaders } = require('@saasplug/shared-utils');

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

// User management — operator only (gateway injects x-user-* headers for /api/auth/users)
router.get('/users', userFromGatewayHeaders, ctrl.listUsers);
router.patch('/users/:id/role', userFromGatewayHeaders, ctrl.assignRole);

// Internal — set role (service-to-service, called directly to auth-service bypassing gateway)
router.post('/internal/set-role', ctrl.setRoleInternal);

// First-run bootstrap — sets the first operator; returns 409 once one exists
router.get('/bootstrap/status', ctrl.bootstrapStatus);
router.post('/bootstrap', ctrl.bootstrap);

module.exports = router;
