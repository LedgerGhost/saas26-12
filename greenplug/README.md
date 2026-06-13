# MICROSERVICE

## greenplug-service

Adapter for the greenPlug external provider API.

- **Port:** `5011`
- **Entrypoint:** `src/server.js`
- **Cache:** Valkey greenPlug cache

## Responsibilities

- Maps greenPlug station payloads into saasPlug Station DTOs.
- Caches static station data for one day and dynamic status/pricing for 30 seconds.
- Fetches station details from greenPlug.
- Sends greenPlug reservation requests.

## Provider Mapping

- list: `GET /chargingPoints`
- detail: `GET /chargingPoints/:id`
- reserve: `POST /chargingPoints/:id/reservations`

## Environment

- `PORT`
- `PROVIDER_ID`
- `PROVIDER_API_BASE_URL`
- `PROVIDER_API_KEY`
- `VALKEY_URL`

## Run

```bash
npm install
npm start
```
