# Sentinel Tandem Suite First-Run Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installed Windows launcher and setup artifact that repair missing runtime dependencies on first launch.

**Architecture:** Source checkouts continue through npm and Vite. Installed packages are detected by bundled `runtime\node.exe`; that path repairs VC++ runtime, starts the built production server from `dist-server`, serves the built Vite UI from `dist`, and opens the local dashboard.

**Tech Stack:** PowerShell, Node.js, TypeScript, Vite, Inno Setup, Node built-in tests.

---

### Task 1: Static tests

**Files:**
- Modify: `package.json`
- Create: `server/windowsInstallerBootstrap.test.ts`

- [ ] Add static tests covering installed/source launcher detection, VC++ runtime repair, bundled Node startup, workflow packaging, and README instructions.
- [ ] Run `npm test` and confirm it fails before implementation.

### Task 2: Launcher installed mode

**Files:**
- Modify: `Launch-Sentinel-Tandem.bat`
- Modify: `Launch-Sentinel-Tandem.ps1`

- [ ] Harden the batch wrapper for partial extracts and forward arguments.
- [ ] Add installed launcher mode using bundled `runtime\node.exe`.
- [ ] Preserve source launcher behavior when installed runtime files are absent.

### Task 3: Workflow and docs

**Files:**
- Create: `.github/workflows/build.yml`
- Modify: `README.md`

- [ ] Build `dist-server` and `dist`.
- [ ] Install production dependencies into the release folder.
- [ ] Copy bundled Node runtime and launcher pair.
- [ ] Build/upload `SentinelTandem-Setup-<version>.exe`.
- [ ] Document beta installer behavior and support logs.
