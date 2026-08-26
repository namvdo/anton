#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_step() {
  local label="$1"
  shift
  echo
  echo "==> ${label}"
  "$@"
}

cd "$REPOSITORY_DIRECTORY"

run_step "Testing release and document tooling" python3 -m unittest discover -s scripts/tests -p 'test_*.py'
run_step "Checking Rust formatting" cargo fmt --all -- --check
run_step "Running Rust lints" cargo clippy --all-targets -- -D warnings
run_step "Running Rust tests" cargo test --all-targets --locked
run_step "Writing scientific validation report" cargo run --release --locked --bin scientific_validation -- --out validation/reference_results.json
run_step "Running Wei thesis smoke reproduction" cargo run --release --locked --bin wei_thesis_reproduction -- --out validation/wei_reproduction_smoke.json

cd "$REPOSITORY_DIRECTORY/frontend"

if [[ ! -d node_modules ]]; then
  run_step "Installing locked frontend dependencies" npm ci
fi

run_step "Building WebAssembly" npm run build:wasm
run_step "Auditing production dependencies" npm audit --omit=dev --audit-level=high
run_step "Type-checking frontend" npm run typecheck
run_step "Linting frontend" npm run lint
run_step "Running frontend tests" npm test
run_step "Building production frontend" npm run build

echo
echo "BIST verification passed."
