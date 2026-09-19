#!/usr/bin/env bash
# Compact full verification for agents. Stops on first failure.
# Use ONCE when commit-ready, not during development.
# During development, run only the specific test:
#   pnpm exec vitest run path/to/file.test.ts 2>&1 | tail -30
set -euo pipefail

run_step() {
  local name=$1; shift
  printf '\n--- %s ---\n' "$name"
  local output
  if output=$("$@" 2>&1); then
    printf '%s\n' "$output" | tail -3
    printf '✓ %s\n' "$name"
  else
    local rc=$?
    printf '%s\n' "$output" | tail -30
    printf '✗ %s (exit %d)\n' "$name" "$rc"
    exit "$rc"
  fi
}

run_step lint:fix   pnpm run lint:fix
run_step lint       pnpm run lint
run_step check      pnpm run check
run_step check:i18n pnpm run check:i18n
run_step test       pnpm run test
run_step build      pnpm run build
run_step check:routes pnpm run check:routes

printf '\n=== All checks passed ===\n'
