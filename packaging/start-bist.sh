#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIRECTORY="${PACKAGE_DIRECTORY}/app"
PORT="${1:-8000}"

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "Port must be an integer from 1024 to 65535." >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to start the local static server." >&2
  exit 1
fi

if [[ ! -f "${APP_DIRECTORY}/index.html" ]]; then
  echo "The packaged application is missing: ${APP_DIRECTORY}/index.html" >&2
  exit 1
fi

echo "Starting BIST at http://127.0.0.1:${PORT}"
echo "Press Ctrl+C to stop the server."
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$APP_DIRECTORY"
