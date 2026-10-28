---
id: 2026-10-13-agent-doc-structure
status: current
summary: >-
  The root routes agents to workflow, verification, & technical references on demand.
evidence:
  - AGENTS.md
  - docs/agent-reference.md
  - docs/agent-verification.md
  - docs/agent-workflow.md
relationships: []
---

# Agent docs: lean root, on-demand guides

## Context

`AGENTS.md` had grown to about 29 KB: roughly 8.3K tokens re-read on every Claude turn, & 89% of
Codex’s default 32 KiB project-doc cap before any nested guidance. Most of it (attribution minutiae,
the command table, code-style detail, the visual checklist) applies to only some tasks. Anthropic’s
and OpenAI’s guidance both favor a short always-loaded file with specialized procedure loaded just
in time.

## Decision

`AGENTS.md` keeps only rules every task needs, as short named sections (no numbered `§` references),
& points at three on-demand guides by task trigger: `docs/agent-workflow.md` (attribution, task
sequence, review records, handoffs), `docs/agent-verification.md` (focused checks, CI coverage, full
matrix exceptions, visual & review gates), & `docs/agent-reference.md` (worktree mechanics, asset
inputs, commands, enforcement boundaries, code conventions). Each detailed procedure has one owner;
the root repeats only hard invariants. Focused tests are the stated default for every agent. A
`CLAUDE.md` containing `@AGENTS.md` stays as the bridge. Links, not imports, load the guides.

## Alternatives

- Claude `@` imports for the guides: they expand at launch, so nothing is saved.
- Nested `AGENTS.md` files or skills: Codex shares one byte budget across the chain, & skills are
  not discovered the same way by both agents; revisit once there is a client-specific need.
- Leaving the root as is & pruning: the bloat is structural, so pruning would regrow.

## Revisit if

The root grows past about 14 KB again; an agent proves unable to follow trigger links reliably; or
both clients gain a shared skill-discovery mechanism worth adopting for these procedures.
