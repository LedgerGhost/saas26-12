# MICROSERVICE

## provider-orchestrator

Provider adapter fan-out and station operation router.

- **Port:** `5007`
- **Entrypoint:** `src/server.js`
- **Cache:** Valkey orchestrator cache
- **Depends on:** redPlug, greenPlug, and bluePlug adapter services

## Responsibilities

- Fans out station list requests to all provider adapters.
- Caches full station lists for short periods.
- Routes station detail requests by `providerId:externalStationId`.
- Routes reservation requests to the correct adapter.

## Main Routes

- `GET /stations`
- `GET /stations/:stationId`
- `POST /stations/:stationId/reserve`

## Environment

- `PORT`
- `REDPLUG_URL`
- `GREENPLUG_URL`
- `BLUEPLUG_URL`
- `VALKEY_URL`

## Run

```bash
npm install
npm start
```
