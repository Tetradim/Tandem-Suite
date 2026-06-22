# Sentinel Tandem Suite

Unified operator console for Sentinel Edge and Sentinel Pulse.

Tandem Suite keeps the Sentinel services separate and visible. Edge remains the analysis, readiness, signal, and risk-decision service. Pulse remains the broker-facing execution service. Tandem runs a small server-side connector, reads both services, normalizes their status, and presents one focused operations dashboard.

Tandem is intentionally read-only in its current scope. It does not place broker orders, does not send handoff commands, and does not expose the Pulse Edge API key to browser JavaScript.

## Current Feature Map

| Area | Current capability |
|------|--------------------|
| System Pair | Shows Edge liveness/readiness and Pulse health/Edge API status side by side. |
| Readiness | Reads Edge `/api/ready` and surfaces readiness status plus failing check details. |
| Automation | Reads Edge `/api/automation`, including mode, enabled state, and last handoff metadata when present. |
| Pulse account | Reads Pulse `/api/edge/account/status` through the Tandem server and shows broker-backed equity, cash, open positions, and P&L where available. |
| Edge Pulse mirror | Reads Edge `/api/pulse/account` and `/api/pulse/positions` to compare what Edge believes Pulse reported. |
| Tickers | Reads Pulse `/api/edge/tickers` and uses ticker trailing-state metadata for protected-position counts. |
| Trade state | Builds one shared trade-state view from Pulse positions, Edge positions, and latest Edge decision data. |
| Drift monitor | Compares Pulse position price against Edge position or decision price and classifies drift severity. |
| Handoff inbox | Shows Edge's last handoff payload/status if `/api/automation` reports it. |
| Event journal | Shows a compact response journal for Edge liveness, Edge readiness, Pulse health, and Pulse Edge API calls. |
| Server-side secret handling | Keeps `PULSE_EDGE_API_KEY` on the Tandem Express server; the browser receives only normalized results/errors. |
| Local launcher | Starts Tandem, opens a dedicated browser profile, and closes the server when the browser closes or vice versa. |
| Simulation support | Can point both Edge and Pulse URLs at Sentinel Simulation Engine to test dashboard behavior without a broker. |

## Architecture

```text
Browser
  |
  | React + Vite
  | GET /api/tandem/config
  | GET /api/tandem/snapshot
  v
Tandem Express Connector
  |-- reads EDGE_API_URL
  |-- reads PULSE_API_URL
  |-- attaches PULSE_EDGE_API_KEY only server-side
  |-- normalizes successes, HTTP failures, timeouts, and missing config
  v
Sentinel Edge API                 Sentinel Pulse API
  |-- /api/live                    |-- /api/health
  |-- /api/ready                   |-- /api/edge/status
  |-- /api/automation              |-- /api/edge/account/status
  |-- /api/decisions               |-- /api/edge/tickers
  |-- /api/pulse/*                 |
```

The UI is intentionally built from real service responses. If Edge, Pulse, or the simulation engine is down, Tandem shows the concrete endpoint failure rather than substituting demo data.

## Safety Model

- Tandem is a visibility and coordination surface.
- Current actions are read-only.
- Broker-affecting controls should stay in Edge or Pulse until Tandem has explicit confirmation, audit logging, role gating, and owner-service contracts.
- `PULSE_EDGE_API_KEY` is consumed only by `server/index.ts`.
- Do not expose broker-capable Pulse endpoints directly from public browser routes.
- For internet deployment, put Tandem behind authentication and keep Edge/Pulse on private network routes.

## Configuration

Create `.env.local` from the example file and point the suite at running Edge and Pulse services.

```powershell
Copy-Item .env.example .env.local
```

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `EDGE_API_URL` | `http://localhost:8000` | Sentinel Edge backend URL. |
| `PULSE_API_URL` | `http://localhost:8001` | Sentinel Pulse backend URL. |
| `PULSE_EDGE_API_KEY` | unset | API key Pulse expects for `/api/edge/*`; stays on Tandem server. |
| `REFRESH_MS` | `5000` | Dashboard refresh interval in milliseconds. |
| `PORT` | `3005` in single-port production, `8005` for the dev connector | Tandem server port. |

Launcher flags can override Edge/Pulse URLs and Pulse key for local sessions:

```powershell
.\Launch-Sentinel-Tandem.ps1 -BackendPort 8005 -FrontendPort 3005 -EdgeApiUrl http://localhost:8000 -PulseApiUrl http://localhost:8001
.\Launch-Sentinel-Tandem.ps1 -PulseEdgeApiKey "your-pulse-key"
```

## Local Run

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:3005
```

The local dev command starts:

- Tandem API connector at `http://127.0.0.1:8005`
- Vite UI at `http://localhost:3005`, proxying `/api` to the connector

## Windows Launcher

Double-click `Launch-Sentinel-Tandem.bat`, or run:

```powershell
.\Launch-Sentinel-Tandem.ps1
```

Useful launcher options:

```powershell
.\Launch-Sentinel-Tandem.ps1 -BackendPort 8005 -FrontendPort 3005 -EdgeApiUrl http://localhost:8000 -PulseApiUrl http://localhost:8001
.\Launch-Sentinel-Tandem.ps1 -PulseEdgeApiKey "your-pulse-key"
.\Launch-Sentinel-Tandem.ps1 -InstallDeps -Rebuild
.\Launch-Sentinel-Tandem.ps1 -NoBrowser
.\Launch-Sentinel-Tandem.ps1 -SmokeTest
```

The launcher:

1. Resolves Node and npm.
2. Installs dependencies when `node_modules` is missing or `-InstallDeps` is passed.
3. Starts the Tandem API/backend on the selected backend port.
4. Starts the Vite UI on the selected frontend port.
5. Verifies the suite responds.
6. Opens a dedicated Edge/Chrome app window with a temporary browser profile unless `-NoBrowser` is set.
7. Starts a hidden watchdog so closing the launcher window closes the dedicated browser profile and owned server process.
8. Watches the dedicated browser window and stops Tandem if the browser closes.

This lifecycle matches the local launchers for Sentinel Pulse, Sentinel Edge, and Sentinel Simulation Engine.

## macOS Beta Installer

MacBook beta testers can install the local source build with the bundled macOS installer script. It installs npm dependencies and adds a double-click launcher to the Desktop.

Prerequisites:

- macOS
- Node.js 20+ with `npm`
- Running Sentinel Edge and Sentinel Pulse services, or Sentinel Simulation Engine for broker-free testing

From the repository root:

```bash
chmod +x install-macos.sh
./install-macos.sh
```

After installation, double-click `Sentinel Tandem Suite.command` on the Desktop. Logs are written to `~/Desktop/Sentinel-Tandem-Suite.log`.

Manual launch options:

```bash
./install-macos.sh --launch
./install-macos.sh --launch --edge-api-url http://127.0.0.1:8000 --pulse-api-url http://127.0.0.1:8001
./install-macos.sh --launch --pulse-edge-api-key "your-pulse-key"
./install-macos.sh --launch --backend-port 8005 --frontend-port 3005 --no-browser
```

## Simulation Engine Mode

For broker-free Tandem testing, point both bot URLs at Sentinel Simulation Engine:

```powershell
$env:EDGE_API_URL = "http://127.0.0.1:9200"
$env:PULSE_API_URL = "http://127.0.0.1:9200"
$env:PULSE_EDGE_API_KEY = "local-sim-key"
npm run dev
```

Or with the launcher:

```powershell
.\Launch-Sentinel-Tandem.ps1 -EdgeApiUrl http://127.0.0.1:9200 -PulseApiUrl http://127.0.0.1:9200 -PulseEdgeApiKey local-sim-key
```

In this setup, Tandem reads both Edge-facing and Pulse-facing contracts from the same simulation state.

## Production Build

```powershell
npm run build
npm start
```

`npm run build` compiles both the server TypeScript project and the React/Vite client.

## Connector Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/tandem/config` | Browser-safe active config: Edge URL, Pulse URL, refresh interval, and whether the Pulse key is configured. |
| GET | `/api/tandem/snapshot` | Aggregated Edge/Pulse snapshot with per-service `ok`, status, latency, data, and error fields. |

Snapshot source calls:

| Source | Endpoint |
|--------|----------|
| Edge | `/api/live` |
| Edge | `/api/ready` |
| Edge | `/api/automation` |
| Edge | `/api/decisions` |
| Edge | `/api/pulse/handoff/schema` |
| Edge | `/api/pulse/account` |
| Edge | `/api/pulse/positions` |
| Pulse | `/api/health` |
| Pulse | `/api/edge/status` |
| Pulse | `/api/edge/account/status` |
| Pulse | `/api/edge/tickers` |

## Verification

```powershell
npm run build
.\Launch-Sentinel-Tandem.ps1 -SmokeTest
git diff --check
```

Use the Simulation Engine mode for a local end-to-end dashboard check without broker access.

## Repository Layout

```text
.
|-- server/index.ts                  # Express connector and snapshot aggregator
|-- src/App.tsx                      # Tandem dashboard
|-- src/api.ts                       # Browser API helpers
|-- src/types.ts                     # Normalized service/result types
|-- src/styles.css                   # Dashboard styling
|-- Launch-Sentinel-Tandem.ps1       # Windows lifecycle launcher
|-- Launch-Sentinel-Tandem.bat
|-- package.json
`-- README.md
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
