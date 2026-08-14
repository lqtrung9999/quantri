#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${HOME}/.local/node/bin/node"
SESSION_SECRET_FILE="${APP_DIR}/.session-secret"
LOG_DIR="${APP_DIR}/logs"
PID_FILE="${APP_DIR}/.server.pid"

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "Node.js has not been installed at ${NODE_BIN}." >&2
  exit 1
fi

if [[ ! -f "${SESSION_SECRET_FILE}" || ! -f "${APP_DIR}/users.json" ]]; then
  echo "Missing production secrets or user accounts." >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"
if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
  kill "$(cat "${PID_FILE}")"
  sleep 1
fi

cd "${APP_DIR}"
nohup env PORT=3000 SESSION_SECRET="$(cat "${SESSION_SECRET_FILE}")" "${NODE_BIN}" server.js \
  >> "${LOG_DIR}/server.log" 2>&1 < /dev/null &
echo $! > "${PID_FILE}"
sleep 1
kill -0 "$(cat "${PID_FILE}")" 2>/dev/null || { echo "Server exited unexpectedly" >&2; exit 1; }
