#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${HOME}/.local/node/bin/node"
SESSION_SECRET_FILE="${APP_DIR}/.session-secret"
LOG_DIR="${APP_DIR}/logs"

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "Node.js has not been installed at ${NODE_BIN}." >&2
  exit 1
fi

if [[ ! -f "${SESSION_SECRET_FILE}" || ! -f "${APP_DIR}/users.json" ]]; then
  echo "Missing production secrets or user accounts." >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"
tmux kill-session -t quantri-dashboard 2>/dev/null || true
tmux new-session -d -s quantri-dashboard \
  "cd '${APP_DIR}' && PORT=3000 SESSION_SECRET=\"\$(cat '${SESSION_SECRET_FILE}')\" exec '${NODE_BIN}' server.js >> '${LOG_DIR}/server.log' 2>&1"
