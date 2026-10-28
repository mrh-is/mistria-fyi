---
id: 2026-10-13-windows-worktree-processes
status: needs-review
summary: >-
  Query `Win32_Process` through noninteractive PowerShell & conservatively preserve worktrees
  referenced by absolute executable or command-line argument paths. Reuse the existing containment
  check, using platform path APIs. Retain the idle-window guard for processes whose working
  directory is their only connection to a worktree, inaccessible process records, & unavailable
  enumeration.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-13-windows-worktree-processes.md#decision
relationships: []
---

# Windows worktree protection

## Context

Issue #40 records orphaned Vite & workerd processes locking SQLite files during worktree removal.
The cleanup helper previously had no process inventory on Windows.

## Decision

Query `Win32_Process` through noninteractive PowerShell & conservatively preserve worktrees
referenced by absolute executable or command-line argument paths. Reuse the existing containment
check, using platform path APIs. Retain the idle-window guard for processes whose working directory
is their only connection to a worktree, inaccessible process records, & unavailable enumeration.

## Alternatives

Killing matching processes could interrupt active sessions. Cleanup only preserves their worktrees.
Inspecting native process working directories would require additional tooling & permissions;
PowerShell's process inventory is available on Windows without adding dependencies.

## Revisit if

Native Windows verification finds dev-server invocations without absolute argument paths, or
repeated locked removals demonstrate that the process inventory misses relevant references.
