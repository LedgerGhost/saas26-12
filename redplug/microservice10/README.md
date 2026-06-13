# MICROSERVICE

## redplug-service

Adapter for the redPlug external provider API.

- **Port:** `5010`
- **Entrypoint:** `src/server.js`
- **Cache:** Valkey redPlug cache

## Responsibilities

- Maps redPlug station payloads into saasPlug Station DTOs.
- Caches static station data for one day and dynamic status data for 30 seconds.
- Fetches station details from redPlug.
- Sends redPlug reservation requests.

## Provider Mapping

- list: `GET /points`
- detail: `GET /point/:id`
- reserve: `POST /reserve/:id/:minutes`

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
