# MICROSERVICE

## reservation-service

Reservation creation and reservation history service.

- **Port:** `5004`
- **Entrypoint:** `src/server.js`
- **MongoDB:** `mongo-reservationdb`, collection `reservations`
- **Publishes events:** `reservation.confirmed`, `reservation.rejected`

## Responsibilities

- Creates station reservations for authenticated users.
- Calls provider-orchestrator to reserve the external station.
- Looks up provider pricing through provider-service.
- Persists reservation outcomes.
- Allows operators to list all reservations with `scope=all`.

## Main Routes

- `POST /api/reservations`
- `GET /api/reservations`
- `GET /api/reservations/:id`

## Environment

- `PORT`
- `MONGO_URI`
- `ORCHESTRATOR_URL`
- `PROVIDER_SERVICE_URL`
- `INTERNAL_AUTH_TOKEN`
- `RABBITMQ_URL`
- `JWT_SECRET`

## Run

```bash
npm install
npm start
```
