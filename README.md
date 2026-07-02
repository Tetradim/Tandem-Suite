# Sentinel Core

Unified operator console for Sentinel Edge and Sentinel Pulse.

Sentinel Core keeps the Sentinel services separate and visible. Edge remains the analysis, readiness, signal, and risk-decision service. Pulse remains the broker-facing execution service. Sentinel Core runs a small server-side connector, reads both services, normalizes their status, and presents one focused operations dashboard.

Sentinel Core is intentionally read-only in its current scope. It does not place broker orders, does not send handoff commands, and does not expose the Pulse Edge API key to browser JavaScript. The optional server-side bus relay is disabled by default and only allows observer event types on exact `/api/bus/events` relay when explicitly enabled; observer events carrying structured execution or control directives are rejected.

## Current Feature Map

| Area | Current capability |
|------|--------------------|
| System Pair | Shows Edge liveness/readiness and Pulse health/Edge API status side by side. |
| Readiness | Reads Edge `/api/ready` and surfaces readiness status plus failing check details. |
| Automation | Reads Edge `/api/automation`, including mode, enabled state, and last handoff metadata when present. |
| Pulse account | Reads Pulse `/api/edge/account/status` through the Sentinel Core server and shows broker-backed equity, cash, open positions, and P&L where available. |
| Edge Pulse mirror | Reads Edge `/api/pulse/account` and `/api/pulse/positions` to compare what Edge believes Pulse reported. |
| Tickers | Reads Pulse `/api/edge/tickers` and uses ticker trailing-state metadata for protected-position counts. |
| Trade state | Builds one shared trade-state view from Pulse positions, Edge positions, and latest Edge decision data. |
| Drift monitor | Compares Pulse position price against Edge position or decision price and classifies drift severity. |
| Handoff inbox | Shows Edge's last handoff payload/status if `/api/automation` reports it. |
| Event journal | Shows a compact response journal for Edge liveness, Edge readiness, Pulse health, and Pulse Edge API calls. |
| Server-side secret handling | Keeps `PULSE_EDGE_API_KEY` on the Sentinel Core Express server; the browser receives only normalized results/errors. |
| Local launcher | Starts Sentinel Core, opens a dedicated browser profile, and closes the server when the browser closes or vice versa. |
| Simulation support | Can point both Edge and Pulse URLs at Sentinel Archive to test dashboard behavior without a broker. |

## Architecture

```text
Browser
  |
  | React + Vite
  | GET /api/sentinel-core/config
  | GET /api/sentinel-core/snapshot
  v
Sentinel Core Express Connector
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

The UI is intentionally built from real service responses. If Edge, Pulse, or the Sentinel Archive is down, Sentinel Core shows the concrete endpoint failure rather than substituting demo data.

## Safety Model

- Sentinel Core is a visibility and coordination surface.
- Current actions are read-only.
- Observer bus ingress and relay accept free-text signal observations, but reject structured control fields such as order side/quantity, risk settings, trailing stops, bot start/stop commands, and kill-switch directives.
- Broker-affecting controls should stay in Edge or Pulse until Sentinel Core has explicit confirmation, audit logging, role gating, and owner-service contracts.
- `PULSE_EDGE_API_KEY` is consumed only by `server/index.ts`.
- `SENTINEL_CORE_OPERATOR_SECRET` is required for all `/api` routes when Sentinel Core runs with `NODE_ENV=production` or binds to a non-local host.
- Do not expose broker-capable Pulse endpoints directly from public browser routes.
- For internet deployment, put Sentinel Core behind authentication and keep Edge/Pulse on private network routes.

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
| `PULSE_EDGE_API_KEY` | unset | API key Pulse expects for `/api/edge/*`; stays on Sentinel Core server. |
| `SENTINEL_CORE_RELAY_ENABLED` | unset / false | Enables the narrow observer bus-event relay only; arbitrary POST relay, Pulse handoff paths, and execution-shaped event types stay blocked. |
| `SENTINEL_CORE_RELAY_SECRET` | unset | Required when `SENTINEL_CORE_RELAY_ENABLED=true`; clients must send the same value in `X-Sentinel-Core-Relay-Secret`. |
| `SENTINEL_CORE_OPERATOR_SECRET` | unset | Required for every `/api` request when `NODE_ENV=production` or `HOST` is non-local; clients must send it in `X-Sentinel-Core-Operator-Secret`. |
| `REFRESH_MS` | `5000` | Dashboard refresh interval in milliseconds. |
| `PORT` | `3005` in single-port production, `8005` for the dev connector | Sentinel Core server port. |
| `HOST` | `127.0.0.1` | Sentinel Core server bind host. Set only when deliberately exposing the dashboard/API connector beyond the local machine. |

Launcher flags can override Edge/Pulse URLs and Pulse key for local sessions:

```powershell
.\Launch-Sentinel-Core.ps1 -BackendPort 8005 -FrontendPort 3005 -EdgeApiUrl http://localhost:8000 -PulseApiUrl http://localhost:8001
.\Launch-Sentinel-Core.ps1 -PulseEdgeApiKey "your-pulse-key"
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

- Sentinel Core API connector at `http://127.0.0.1:8005`
- Vite UI at `http://127.0.0.1:3005`, proxying `/api` to the connector

## Windows Beta Installer

For non-technical beta testers, download and run `SentinelCore-Setup-<version>.exe` from the Windows release artifact.

After installation, double-click **Sentinel Core** from the Desktop or Start Menu. The installed launcher downloads missing runtime dependencies on first launch, including the Microsoft Visual C++ Runtime when Windows does not already have it. The installed beta build includes its own Node runtime, production dependencies, Sentinel Core server, and built dashboard.

Installed beta testers do not need to install Node.js, npm, or Vite. If startup fails, send a screenshot of the launcher window and the Desktop log file named `Sentinel-Core.log`.

Default installed URLs:

| Service | URL |
| --- | --- |
| Sentinel Core dashboard | `http://127.0.0.1:3005` |
| Snapshot API | `http://127.0.0.1:3005/api/sentinel-core/snapshot` |

## Windows Launcher

Double-click `Launch-Sentinel-Core.bat`, or run:

```powershell
.\Launch-Sentinel-Core.ps1
```

Useful launcher options:

```powershell
.\Launch-Sentinel-Core.ps1 -BackendPort 8005 -FrontendPort 3005 -EdgeApiUrl http://localhost:8000 -PulseApiUrl http://localhost:8001
.\Launch-Sentinel-Core.ps1 -PulseEdgeApiKey "your-pulse-key"
.\Launch-Sentinel-Core.ps1 -InstallDeps -Rebuild
.\Launch-Sentinel-Core.ps1 -NoBrowser
.\Launch-Sentinel-Core.ps1 -SmokeTest
```

The launcher:

1. Resolves Node and npm.
2. Installs dependencies when `node_modules` is missing or `-InstallDeps` is passed.
3. Starts the Sentinel Core API/backend on the selected backend port.
4. Starts the Vite UI on the selected frontend port.
5. Verifies the suite responds.
6. Opens a dedicated Edge/Chrome app window with a temporary browser profile unless `-NoBrowser` is set.
7. Starts a hidden watchdog so closing the launcher window closes the dedicated browser profile and owned server process.
8. Watches the dedicated browser window and stops Sentinel Core if the browser closes.

This lifecycle matches the local launchers for Sentinel Pulse, Sentinel Edge, and Sentinel Archive.

## macOS Beta Installer

MacBook beta testers can install the local source build with the bundled macOS installer script. It installs npm dependencies and adds a double-click launcher to the Desktop.

Prerequisites:

- macOS
- Node.js 20+ with `npm`
- Running Sentinel Edge and Sentinel Pulse services, or Sentinel Archive for broker-free testing

From the repository root:

```bash
chmod +x install-macos.sh
./install-macos.sh
```

After installation, double-click `Sentinel Core.command` on the Desktop. Logs are written to `~/Desktop/Sentinel-Core.log`.

Manual launch options:

```bash
./install-macos.sh --launch
./install-macos.sh --launch --edge-api-url http://127.0.0.1:8000 --pulse-api-url http://127.0.0.1:8001
./install-macos.sh --launch --pulse-edge-api-key "your-pulse-key"
./install-macos.sh --launch --backend-port 8005 --frontend-port 3005 --no-browser
```

## Sentinel Archive Mode

For broker-free Sentinel Core testing, point both bot URLs at Sentinel Archive:

```powershell
$env:EDGE_API_URL = "http://127.0.0.1:9200"
$env:PULSE_API_URL = "http://127.0.0.1:9200"
$env:PULSE_EDGE_API_KEY = "local-sim-key"
npm run dev
```

Or with the launcher:

```powershell
.\Launch-Sentinel-Core.ps1 -EdgeApiUrl http://127.0.0.1:9200 -PulseApiUrl http://127.0.0.1:9200 -PulseEdgeApiKey local-sim-key
```

In this setup, Sentinel Core reads both Edge-facing and Pulse-facing contracts from the same simulation state.

## Production Build

```powershell
npm run build
npm start
```

`npm run build` compiles both the server TypeScript project and the React/Vite client.

## Connector Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sentinel-core/config` | Browser-safe active config: Edge URL, Pulse URL, refresh interval, and whether the Pulse key is configured. |
| GET | `/api/sentinel-core/snapshot` | Aggregated Edge/Pulse snapshot with per-service `ok`, status, latency, data, and error fields. |

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
npm test
npm run build
.\Launch-Sentinel-Core.ps1 -SmokeTest
git diff --check
```

Use the Sentinel Archive mode for a local end-to-end dashboard check without broker access.

### Live-Money Readiness Status - 2026-06-24

Current status: operational read-only dashboard for paper burn-in monitoring; not an execution control surface.

Latest local verification:
- Server/UI tests: `npm test` -> 22 passed.
- Runtime snapshot saw Pulse health OK, Pulse Edge API OK, Alpaca connected, VPG present after the Edge-to-Pulse drill, and Pulse reconciliation breaks at `0`.
- Sentinel Core keeps Pulse service-auth calls server-side and does not expose the Pulse Edge API key to browser JavaScript.

Open gates before live-money use:
- Add a read-only readiness evidence panel fed by Pulse burn-in records.
- Keep broker-affecting actions out of Sentinel Core until role-gated confirmation, audit records, and owner-service contracts are implemented.
- Retain multi-session snapshots and incident evidence for operator signoff.

## Repository Layout

```text
.
|-- server/index.ts                  # Express connector and snapshot aggregator
|-- src/App.tsx                      # Sentinel Core dashboard
|-- src/api.ts                       # Browser API helpers
|-- src/types.ts                     # Normalized service/result types
|-- src/styles.css                   # Dashboard styling
|-- Launch-Sentinel-Core.ps1       # Windows lifecycle launcher
|-- Launch-Sentinel-Core.bat
|-- package.json
`-- README.md
```

## Current Scope

The first screen is the Sentinel Core dashboard:

- Edge/Pulse service status
- Edge readiness and automation status
- Pulse broker account and position truth
- Shared trade-state view
- Drift and handoff visibility
- Real response journal

Actions are read-only in this first screen. Broker-affecting controls should go through the owning service contracts after confirmation, audit handling, and role gating are added.
