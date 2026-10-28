---
id: 2026-10-07-clear-acceptance-criteria
status: current
summary: >-
  Clear existing issue criteria authorize implementation without a second approval checklist.
evidence:
  - AGENTS.md
  - docs/agent-workflow.md
relationships: []
---

# Clear acceptance criteria authorize implementation

## Context

The agent workflow required another checklist approval even when an issue already supplied clear
acceptance criteria. The maintainer requested removal of that duplicate gate while authorizing
[mrh-is/mistria-fyi-private#689](https://github.com/mrh-is/mistria-fyi-private/issues/689).

## Decision

Proceed within clear existing acceptance criteria without requesting approval again. Ask about
unresolved scope, conflicting requirements, or decisions those criteria do not settle. Draft an
approval checklist only when clear criteria are absent.

## Alternatives

Retaining mandatory approval for every checklist duplicates an existing specification & interrupts
authorized work. Treating unclear criteria as authorization would conceal unresolved decisions.

## Revisit if

Repeated implementations meeting written criteria still diverge from the maintainer’s intended
scope; clarify the criteria or add a narrowly scoped gate for the affected class of work.
