---
id: 2026-11-01-focused-node-projects
status: current
summary: >-
  Focused plain-Node Vitest runs select their project explicitly to avoid unrelated Cloudflare proxy
  startup before file filtering.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/394
  - vite.config.ts
relationships: []
---

# Select focused Node projects

## Context

A path-only run of `scripts/guard-generated-reads.test.ts` stalled twice for over 400 seconds under
heavy host load. The same file finished in 1.4 seconds with `--project node`. The test belongs to
one project, but unselected app projects can still start the Cloudflare adapter’s proxy before file
filtering.

## Decision

Focused runs of plain-Node tests select both the file path & its project. Tests under
`eslint-rules/`, `scripts/`, & `tests/` use `--project node`, or `--project node-isolated` for
`*.isolated.test.ts`. Asset-independent pipeline tests use `--project pipeline`. App tests retain
the path-only command because they need the app’s Vite setup.

## Alternatives

Changing Vitest configuration to avoid all unrelated project startup would change shared test
infrastructure. Explicit project selection already resolves the reported stall & satisfies the
issue’s acceptance criteria, so this change documents that option.

## Revisit if

Explicit project selection still starts unrelated workerd processes, or Vitest provides lazy project
startup that makes path-only runs equally isolated.
