#!/usr/bin/env bash
# Runs the same matrix as CI (ci.yml) locally, with compact output. Stops on first failure.
# CI runs this matrix on every pull request; run it locally only for the exceptions in
# AGENTS.md §7 (pipeline/generated-data changes, high-risk surfaces, CI-only failures).
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
