# MICROSERVICE

## provider-service

Provider onboarding and provider metadata service.

- **Port:** `5002`
- **Entrypoint:** `src/server.js`
- **MongoDB:** `mongo-providerdb`, collection `providers`
- **Depends on:** auth-service, `packages/shared-utils`

## Responsibilities

- Registers charging providers.
- Probes provider APIs before registration.
- Requests provider client credentials from auth-service.
- Stores provider system IDs and reservation pricing.
- Resolves provider records by user ID or provider system ID.

## Main Routes

- `POST /api/providers`
- `GET /api/providers/by-user/:userId`
- `GET /api/providers/by-system/:providerSystemId`
- `GET /api/providers/:providerId`
- `PUT /api/providers/:providerId`

## Environment

- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `AUTH_SERVICE_URL`
- `INTERNAL_AUTH_TOKEN`

## Test

```bash
npm install
npm test
```
