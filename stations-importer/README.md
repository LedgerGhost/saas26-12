# MICROSERVICE

## stations-service

Station search, station cache, and station event service.

- **Port:** `5003`
- **Entrypoint:** `src/server.js`
- **MongoDB:** `mongo-stationdb`, collection `station_cache`
- **Consumes events:** `reservation.confirmed`, `reservation.rejected`
- **Publishes events:** `station.searched`, `station.clicked`

## Responsibilities

- Serves station list/search requests.
- Refreshes station cache from provider-orchestrator when stale.
- Applies provider, status, name, and bounding-box geo filters.
- Logs station searches and station clicks through RabbitMQ.
- Optimistically updates cached station status after reservations.

## Main Routes

- `GET /api/stations`
- `GET /api/stations/:stationId`

## Environment

- `PORT`
- `MONGO_URI`
- `ORCHESTRATOR_URL`
- `RABBITMQ_URL`
- `JWT_SECRET`
- `STATIONS_CACHE_TTL_SEC`

## Run

```bash
npm install
npm start
```
