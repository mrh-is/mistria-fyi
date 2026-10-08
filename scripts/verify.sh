#!/usr/bin/env bash
# Runs CI's non-browser matrix (ci.yml) locally, read-only, with compact output. Stops on first
# failure. Steps: lint, check, check:i18n, test, build, check:routes, check:built. It never modifies the tree
# (run `pnpm run lint:fix` yourself first).
#
# Opt-in steps CI cannot run or only runs conditionally:
#   --assets   also run test:pipeline:assets (needs the game assets; CI has none)
#   --browser  also run the Playwright suites (test:accessibility & test:pwa) against a build
#   --all      both of the above
#
# CI runs the default matrix on every pull request; run this locally only for the exceptions in
# AGENTS.md §7 (pipeline/generated-data changes, high-risk surfaces, CI-only failures).
# During development, run only the specific test:
#   pnpm exec vitest run path/to/file.test.ts 2>&1 | tail -30
set -euo pipefail

with_assets=false
with_browser=false
for arg in "$@"; do
  case "$arg" in
    --assets) with_assets=true ;;
    --browser) with_browser=true ;;
    --all) with_assets=true; with_browser=true ;;
    --) ;;
    *) echo "Usage: pnpm run verify [-- --assets] [--browser] [--all]" >&2; exit 2 ;;
  esac
done

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

run_step lint       pnpm run lint
run_step check      pnpm run check
run_step check:i18n pnpm run check:i18n
run_step test       pnpm run test
run_step build      pnpm run build
run_step check:routes pnpm run check:routes
run_step check:built pnpm run check:built

if $with_assets; then run_step test:pipeline:assets pnpm run test:pipeline:assets; fi
if $with_browser; then
  # Both suites use the production build already validated above.
  run_step test:accessibility env PLAYWRIGHT_SKIP_BUILD=true pnpm run test:accessibility
  run_step test:pwa env PLAYWRIGHT_SKIP_BUILD=true pnpm run test:pwa
fi

printf '\n=== All checks passed ===\n'
