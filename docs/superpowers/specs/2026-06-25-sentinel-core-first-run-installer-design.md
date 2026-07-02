# Sentinel Core first-run installer design

Date: 2026-06-25

## Goal

Windows beta testers should install Sentinel Core from `SentinelCore-Setup-<version>.exe`, double-click the installed shortcut, and have missing runtime dependencies handled automatically on first launch.

## Design

- Keep the existing source launcher for development and workstation-suite source checkouts.
- Add an installed-package branch to `Launch-Sentinel-Core.ps1` when bundled `runtime\node.exe` and `dist-server\server\index.js` exist beside the launcher.
- The installed launcher checks/downloads the Microsoft Visual C++ Runtime, starts the bundled Node runtime in single-port production mode, waits for `/api/sentinel-core/snapshot`, verifies the dashboard HTML, and opens the local UI.
- The Windows workflow builds the TypeScript server and Vite client, installs production dependencies into a release folder, copies the GitHub Actions Node runtime into `runtime\node.exe`, and creates `SentinelCore-Setup-<version>.exe` with Inno Setup.

## Non-goals

- No broker-affecting Sentinel Core features; the suite remains a read-only operator console.
- No Edge or Pulse installation from Sentinel Core; testers still run or simulate those services separately.
- No macOS installer redesign.
