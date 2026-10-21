# Installing missing Playwright browsers

## Context

PR #172’s required PWA verification could not run because Playwright’s pinned Chromium headless
shell was missing, although the full Chromium binary was installed. The tooling-failure rule
required separate user direction before installing that component. The owner authorized the install
& requested standing permission for future runs.

## Decision

Agents may install a missing Playwright browser component needed by a required check, using the
workspace Playwright version & its external browser cache. For Chromium’s headless shell, use
`pnpm exec playwright install chromium --only-shell`. Report the install & request sandbox access
when the cache requires it. The exception does not cover dependency changes, system packages, or
substituting another browser or executable.

## Alternatives

Requiring approval for every missing browser component adds a manual interruption to a routine,
version-pinned setup step. Reusing another executable can change the test environment & conceal a
missing prerequisite; it remains outside this permission.

## Revisit if

Browser downloads require system changes or credentials, the project stops pinning Playwright, or
the browser cache moves into a repository or becomes shared writable test state.
