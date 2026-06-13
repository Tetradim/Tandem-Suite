# Sentinel Tandem Suite

Sentinel Tandem Suite is the unified operator console for Sentinel Edge and Sentinel Pulse.

It keeps the bots separate:

- **Sentinel Edge** remains the analysis, signal, and risk-decision service.
- **Sentinel Pulse** remains the broker-facing execution service.
- **Tandem Suite** runs a small server-side connector, reads both services, and presents one operations dashboard.

All dashboard data comes from Edge and Pulse API responses. If either service is unavailable, the UI shows the real connection or API failure.

## Configuration

Create `.env.local` from the example file and point the suite at running Edge and Pulse services.

```powershell
Copy-Item .env.example .env.local
```

Environment variables:

- `EDGE_API_URL`: Sentinel Edge backend URL. Default: `http://localhost:8001`
- `PULSE_API_URL`: Sentinel Pulse backend URL. Default: `http://localhost:8002`
- `PULSE_EDGE_API_KEY`: API key Pulse expects for `/api/edge/*` endpoints. This stays on the Tandem server.
- `REFRESH_MS`: Dashboard refresh interval in milliseconds. Default: `5000`
- `PORT`: Tandem production server port. Default: `3100`

For a public internet deployment, put Tandem behind authentication and keep Edge/Pulse on private network routes. Do not expose a Pulse broker-capable key from static browser JavaScript.

## Local Run

```powershell
npm install
npm run dev
```

Open `http://localhost:3100`.

The local run starts:

- Tandem API connector at `http://127.0.0.1:3101`
- Vite UI at `http://localhost:3100`, proxying `/api` to the connector

## Production Build

```powershell
npm run build
npm start
```

## Current Scope

The first screen is the Tandem dashboard:

- Edge/Pulse service status
- Edge readiness and automation status
- Pulse broker account and position truth
- Shared trade-state view
- Drift and handoff visibility
- Real response journal

Actions are read-only in this first screen. Broker-affecting controls should go through the owning service contracts after confirmation, audit handling, and role gating are added.
