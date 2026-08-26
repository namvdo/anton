#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REFERENCE_MANIFEST="${REPOSITORY_DIRECTORY}/examples/reference-experiments.txt"
EVIDENCE_PATH="${REPOSITORY_DIRECTORY}/release/release-smoke-evidence.json"
REQUIRE_NETWORK_NAMESPACE=false
USE_EXISTING_ARCHIVE=false
INTERNAL_OFFLINE_PHASE=false
PACKAGE_DIRECTORY=""
PHASE_DIRECTORY=""

usage() {
  cat >&2 <<'EOF'
Usage: ./scripts/release_smoke_test.sh [--require-network-namespace] [--use-existing-archive] [--evidence PATH]

Builds the release archive without repeating the full verification suite, unpacks it
into a temporary directory, starts the packaged launcher offline, and writes JSON evidence.
Use --require-network-namespace in Linux CI to fail unless kernel-enforced isolation is active.
Use --use-existing-archive only after package_release.sh has completed in the same job.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-network-namespace)
      REQUIRE_NETWORK_NAMESPACE=true
      shift
      ;;
    --use-existing-archive)
      USE_EXISTING_ARCHIVE=true
      shift
      ;;
    --evidence)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      EVIDENCE_PATH="$2"
      shift 2
      ;;
    --offline-phase)
      [[ $# -eq 4 ]] || { usage; exit 2; }
      INTERNAL_OFFLINE_PHASE=true
      PACKAGE_DIRECTORY="$2"
      PHASE_DIRECTORY="$3"
      BIST_SMOKE_NETWORK_ISOLATION="$4"
      shift 4
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

run_offline_phase() {
  local port launcher_pid attempt
  local launcher_ready=false
  local launcher_log="${PHASE_DIRECTORY}/launcher.log"
  local served_index="${PHASE_DIRECTORY}/served-index.html"
  local import_results="${PHASE_DIRECTORY}/experiment-imports.json"

  if [[ "${BIST_SMOKE_NETWORK_ISOLATION:-}" == "linux-network-namespace" ]]; then
    command -v ip >/dev/null 2>&1 || { echo "ip is required inside the network namespace." >&2; exit 1; }
    ip link set lo up
  fi

  export http_proxy="http://127.0.0.1:9"
  export https_proxy="http://127.0.0.1:9"
  export HTTP_PROXY="$http_proxy"
  export HTTPS_PROXY="$https_proxy"
  export ALL_PROXY="socks5://127.0.0.1:9"
  export NO_PROXY="127.0.0.1,localhost"
  export no_proxy="$NO_PROXY"

  port="$(python3 - <<'PY'
import socket

with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(listener.getsockname()[1])
PY
)"

  "${PACKAGE_DIRECTORY}/start-bist.sh" "$port" >"$launcher_log" 2>&1 &
  launcher_pid=$!
  trap 'kill "$launcher_pid" 2>/dev/null || true; wait "$launcher_pid" 2>/dev/null || true' EXIT

  for attempt in $(seq 1 50); do
    if curl --fail --silent --show-error --noproxy '*' \
      "http://127.0.0.1:${port}/" --output "$served_index" 2>/dev/null; then
      launcher_ready=true
      break
    fi
    if ! kill -0 "$launcher_pid" 2>/dev/null; then
      echo "The packaged launcher exited before it served the application." >&2
      cat "$launcher_log" >&2
      exit 1
    fi
    sleep 0.1
  done

  [[ "$launcher_ready" == true && -s "$served_index" ]] || {
    echo "The packaged launcher did not become ready." >&2
    cat "$launcher_log" >&2
    exit 1
  }
  cmp --silent "$served_index" "${PACKAGE_DIRECTORY}/app/index.html" || {
    echo "The launcher response differs from the packaged app/index.html." >&2
    exit 1
  }

  [[ -f "${PACKAGE_DIRECTORY}/examples/reference-experiments.txt" ]] || {
    echo "The packaged reference experiment manifest is missing." >&2
    exit 1
  }

  (
    cd "${REPOSITORY_DIRECTORY}/frontend"
    ./node_modules/.bin/tsx scripts/verify-release-experiments.ts \
      "$PACKAGE_DIRECTORY" "${PACKAGE_DIRECTORY}/examples/reference-experiments.txt"
  ) >"$import_results"

  kill "$launcher_pid"
  wait "$launcher_pid" 2>/dev/null || true
  trap - EXIT
}

if [[ "$INTERNAL_OFFLINE_PHASE" == true ]]; then
  run_offline_phase
  exit 0
fi

for command in bash curl node npm python3 tar; do
  command -v "$command" >/dev/null 2>&1 || { echo "$command is required for the release smoke test." >&2; exit 1; }
done
[[ -f "$REFERENCE_MANIFEST" ]] || { echo "Missing reference manifest: $REFERENCE_MANIFEST" >&2; exit 1; }
[[ -x "${REPOSITORY_DIRECTORY}/packaging/start-bist.sh" ]] || {
  echo "The source launcher is not executable: packaging/start-bist.sh" >&2
  exit 1
}
[[ -x "${REPOSITORY_DIRECTORY}/frontend/node_modules/.bin/tsx" ]] || {
  echo "Frontend dependencies are missing; run npm ci in frontend/." >&2
  exit 1
}

VERSION="$(awk -F '"' '/^version = "/ { print $2; exit }' "${REPOSITORY_DIRECTORY}/Cargo.toml")"
PACKAGE_NAME="bist-v${VERSION}"
ARCHIVE="${REPOSITORY_DIRECTORY}/release/${PACKAGE_NAME}.tar.gz"
if [[ "$USE_EXISTING_ARCHIVE" == false ]]; then
  echo "==> Building release archives"
  "${REPOSITORY_DIRECTORY}/scripts/package_release.sh" --skip-verify
fi
[[ -f "$ARCHIVE" ]] || { echo "Expected release archive was not created: $ARCHIVE" >&2; exit 1; }

echo "==> Verifying release checksums"
if command -v shasum >/dev/null 2>&1; then
  (cd "${REPOSITORY_DIRECTORY}/release" && shasum -a 256 -c "${PACKAGE_NAME}.sha256")
else
  (cd "${REPOSITORY_DIRECTORY}/release" && sha256sum -c "${PACKAGE_NAME}.sha256")
fi

TEMPORARY_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/bist-release-smoke.XXXXXX")"
cleanup() {
  chmod -R u+rwX "$TEMPORARY_DIRECTORY" 2>/dev/null || true
  rm -rf "$TEMPORARY_DIRECTORY"
}
trap cleanup EXIT

python3 "${REPOSITORY_DIRECTORY}/scripts/validate_release_archive.py" \
  "$ARCHIVE" "$PACKAGE_NAME"

tar -xzf "$ARCHIVE" -C "$TEMPORARY_DIRECTORY"
PACKAGE_DIRECTORY="${TEMPORARY_DIRECTORY}/${PACKAGE_NAME}"
PHASE_DIRECTORY="${TEMPORARY_DIRECTORY}/phase"
mkdir "$PHASE_DIRECTORY"
[[ -x "${PACKAGE_DIRECTORY}/start-bist.sh" ]] || { echo "Archive launcher is missing or not executable." >&2; exit 1; }

NETWORK_ISOLATION="proxy-deny-environment"
NAMESPACE_COMMAND=()
if [[ "$(uname -s)" == "Linux" ]] && command -v unshare >/dev/null 2>&1 && command -v ip >/dev/null 2>&1; then
  if [[ "$EUID" -eq 0 ]] && unshare --net --fork true 2>/dev/null; then
    NAMESPACE_COMMAND=(unshare --net --fork)
  elif command -v sudo >/dev/null 2>&1 && sudo -n unshare --net --fork true 2>/dev/null; then
    NAMESPACE_COMMAND=(sudo -n env "PATH=$PATH" unshare --net --fork)
  fi
fi

echo "==> Starting the unpacked launcher and importing reference experiments"
if [[ ${#NAMESPACE_COMMAND[@]} -gt 0 ]]; then
  NETWORK_ISOLATION="linux-network-namespace"
  "${NAMESPACE_COMMAND[@]}" bash "$0" --offline-phase \
    "$PACKAGE_DIRECTORY" "$PHASE_DIRECTORY" "$NETWORK_ISOLATION"
elif [[ "$REQUIRE_NETWORK_NAMESPACE" == true ]]; then
  echo "A Linux network namespace is required but could not be created." >&2
  exit 1
else
  bash "$0" --offline-phase \
    "$PACKAGE_DIRECTORY" "$PHASE_DIRECTORY" "$NETWORK_ISOLATION"
fi

python3 "${REPOSITORY_DIRECTORY}/scripts/write_release_smoke_evidence.py" \
  --archive "$ARCHIVE" \
  --package-directory "$PACKAGE_DIRECTORY" \
  --served-index "${PHASE_DIRECTORY}/served-index.html" \
  --import-results "${PHASE_DIRECTORY}/experiment-imports.json" \
  --network-isolation "$NETWORK_ISOLATION" \
  --output "$EVIDENCE_PATH"

echo "Release smoke test passed."
echo "Evidence: $EVIDENCE_PATH"
