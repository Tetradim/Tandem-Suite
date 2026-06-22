#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Sentinel Tandem Suite"
DESKTOP_COMMAND_NAME="Sentinel Tandem Suite.command"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${HOME}/Desktop/Sentinel-Tandem-Suite.log"
BACKEND_PORT=8005
FRONTEND_PORT=3005
EDGE_API_URL="${EDGE_API_URL:-http://localhost:8000}"
PULSE_API_URL="${PULSE_API_URL:-http://localhost:8001}"
PULSE_EDGE_API_KEY="${PULSE_EDGE_API_KEY:-}"
INSTALL_DEPS=0
NO_BROWSER=0
LAUNCH=0
PREPARE_ONLY=0

usage() {
  cat <<USAGE
Usage:
  ./install-macos.sh                 Install dependencies and create a Desktop launcher
  ./install-macos.sh --launch        Start ${APP_NAME}

Options:
  --backend-port PORT       Tandem connector port (default: ${BACKEND_PORT})
  --frontend-port PORT      Tandem UI port (default: ${FRONTEND_PORT})
  --edge-api-url URL        Sentinel Edge URL (default: ${EDGE_API_URL})
  --pulse-api-url URL       Sentinel Pulse URL (default: ${PULSE_API_URL})
  --pulse-edge-api-key KEY  Pulse Edge API key, if required
  --install-deps            Reinstall npm dependencies before launch
  --no-browser              Do not open the browser automatically
  --prepare-only            Install dependencies without starting the app
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --launch) LAUNCH=1 ;;
    --install-deps) INSTALL_DEPS=1 ;;
    --no-browser) NO_BROWSER=1 ;;
    --prepare-only) PREPARE_ONLY=1 ;;
    --backend-port)
      BACKEND_PORT="${2:?Missing value for --backend-port}"
      shift
      ;;
    --backend-port=*) BACKEND_PORT="${1#*=}" ;;
    --frontend-port)
      FRONTEND_PORT="${2:?Missing value for --frontend-port}"
      shift
      ;;
    --frontend-port=*) FRONTEND_PORT="${1#*=}" ;;
    --edge-api-url)
      EDGE_API_URL="${2:?Missing value for --edge-api-url}"
      shift
      ;;
    --edge-api-url=*) EDGE_API_URL="${1#*=}" ;;
    --pulse-api-url)
      PULSE_API_URL="${2:?Missing value for --pulse-api-url}"
      shift
      ;;
    --pulse-api-url=*) PULSE_API_URL="${1#*=}" ;;
    --pulse-edge-api-key)
      PULSE_EDGE_API_KEY="${2:?Missing value for --pulse-edge-api-key}"
      shift
      ;;
    --pulse-edge-api-key=*) PULSE_EDGE_API_KEY="${1#*=}" ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
  shift
done

log() {
  mkdir -p "$(dirname "$LOG_FILE")"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This installer is intended for macOS." >&2
    exit 1
  fi
}

require_node() {
  command -v node >/dev/null 2>&1 || {
    echo "Node.js 20+ is required. Install it from https://nodejs.org/ or Homebrew." >&2
    exit 1
  }
  node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" || {
    echo "Node.js 20+ is required. Current version: $(node --version)" >&2
    exit 1
  }
  command -v npm >/dev/null 2>&1 || {
    echo "npm is required with Node.js." >&2
    exit 1
  }
}

prepare_runtime() {
  require_node
  if [[ "$INSTALL_DEPS" -eq 1 || ! -d "${ROOT_DIR}/node_modules" ]]; then
    log "Installing npm dependencies"
    (cd "$ROOT_DIR" && npm install)
  fi
}

create_desktop_launcher() {
  local desktop_dir="${HOME}/Desktop"
  local command_path="${desktop_dir}/${DESKTOP_COMMAND_NAME}"
  mkdir -p "$desktop_dir"
  cat > "$command_path" <<EOF
#!/usr/bin/env bash
cd "$ROOT_DIR"
exec "$ROOT_DIR/install-macos.sh" --launch
EOF
  chmod +x "$command_path"
  log "Desktop launcher created: ${command_path}"
}

wait_url() {
  local url="$1"
  local seconds="${2:-60}"
  local start
  start="$(date +%s)"
  while (( "$(date +%s)" - start < seconds )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

launch_app() {
  prepare_runtime
  if [[ "$PREPARE_ONLY" -eq 1 ]]; then
    log "Preparation complete"
    return 0
  fi

  local backend_url="http://127.0.0.1:${BACKEND_PORT}"
  local frontend_url="http://127.0.0.1:${FRONTEND_PORT}"
  local pids=()

  export EDGE_API_URL
  export PULSE_API_URL
  export PULSE_EDGE_API_KEY

  log "Starting Tandem connector on ${backend_url}"
  (cd "$ROOT_DIR" && npm exec -- tsx server/index.ts --port "$BACKEND_PORT") >> "$LOG_FILE" 2>&1 &
  pids+=("$!")

  log "Starting Tandem UI on ${frontend_url}"
  (cd "$ROOT_DIR" && npm exec -- vite --host 127.0.0.1 --port "$FRONTEND_PORT") >> "$LOG_FILE" 2>&1 &
  pids+=("$!")

  cleanup() {
    for pid in "${pids[@]}"; do
      kill "$pid" >/dev/null 2>&1 || true
    done
  }
  trap cleanup EXIT INT TERM

  if ! wait_url "${backend_url}/api/tandem/snapshot" 75; then
    log "Connector did not become ready. Recent log output:"
    tail -n 100 "$LOG_FILE" || true
    exit 1
  fi
  if ! wait_url "$frontend_url" 75; then
    log "Frontend did not become ready. Recent log output:"
    tail -n 100 "$LOG_FILE" || true
    exit 1
  fi

  log "Ready: ${frontend_url}"
  log "Edge API: ${EDGE_API_URL}"
  log "Pulse API: ${PULSE_API_URL}"
  if [[ "$NO_BROWSER" -eq 0 ]]; then
    open "$frontend_url"
  fi
  wait "${pids[@]}"
}

require_macos
if [[ "$LAUNCH" -eq 1 ]]; then
  launch_app
else
  INSTALL_DEPS=1
  PREPARE_ONLY=1
  prepare_runtime
  create_desktop_launcher
  log "Install complete. Double-click '${DESKTOP_COMMAND_NAME}' on the Desktop to start ${APP_NAME}."
fi
