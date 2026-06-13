# MICROSERVICE

## analytics-service

Event ingestion, analytics aggregation, and log export service.

- **Port:** `5006`
- **Entrypoint:** `src/server.js`
- **MongoDB:** `mongo-analyticsdb`, collection `log_entries`
- **Consumes events:** `station.*`, `reservation.*`, `invoice.*`, `payment.*`

## Responsibilities

- Converts RabbitMQ domain events into analytics log entries.
- Provides provider-scoped analytics.
- Provides operator global analytics.
- Exports logs as JSON or CSV.
- Expands broad station search events into provider-scoped search logs.

## Main Routes

- `GET /api/analytics`
- `GET /api/analytics/global`
- `POST /api/analytics/export`

## Environment

- `PORT`
- `MONGO_URI`
- `RABBITMQ_URL`
- `JWT_SECRET`
- `PROVIDER_SERVICE_URL`
- `INTERNAL_AUTH_TOKEN`

## Test

```bash
npm install
npm test
```
