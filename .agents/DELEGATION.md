# Multi-Agent Delegation Guide

This file defines how agents in this system should conserve usage by routing to the cheapest capable
model and delegating to other agents when appropriate.

Every agent reading this file is part of the same fleet. You are expected to understand your own
identity and capabilities, and to route work efficiently.

## Routing at session start

Evaluate the task before starting work. **The default is the cheapest capable model, not the most
powerful one.** Escalate only when the task demands it. The table is a project-specific suggestion,
not proof that an ID is available in every harness. Use configured preferences & actual model
availability.

| Task type                                                 | Tier      | Claude          | Codex         |
| --------------------------------------------------------- | --------- | --------------- | ------------- |
| Lint fix, dependency update, doc edit, rename             | Cheap     | Haiku or Sonnet | Luna          |
| Bug fix, single-component feature, test addition          | Default   | Sonnet          | Luna or Terra |
| Multi-file feature, refactoring, CI investigation         | Mid       | Sonnet or Opus  | Terra or Sol  |
| Architecture, difficult debugging, ambiguous requirements | Expensive | Opus            | Sol or Astra  |
| Design work, visual iteration, complex UI                 | Expensive | Opus            | Sol           |

To switch models mid-session (these are per-harness examples; use whatever your harness offers):

- **Claude Code**: `/model <model-id>`, or `set_session_model` in the desktop app
- **Claude subagents**: `model: "sonnet"` / `model: "haiku"` in the Agent tool
- **Codex**: `-c model="<model-id>"`

## The fleet

All agents are on free or subscription tiers with usage limits (except LM Studio which is
local/unlimited). Treat every agent's usage as a shared budget — conserve across the board.

The fleet below describes the **maintainer's machine**. Other environments (cloud sandboxes, CI)
won't have these CLIs or the local LM Studio model; treat the table as machine-specific, not as a
guarantee.

### Delegation rules

- **Ask first.** Spawning an external agent CLI is outward-facing work. Get the user's consent in
  chat before the first spawn in a session. Delegating to your own harness's subagents (for example,
  Claude Code's Agent tool) needs no extra consent.
- **No permission bypasses.** Never pass `--allow-all-tools`, `--auto`, `--yolo`, or similar flags
  that skip approval prompts unless the user explicitly asks for that flag. The commands in the
  table below show the base invocation; run them in each CLI's default approval mode.
- **Isolated edits, shared ownership.** Give each editing subagent a harness-writable isolated
  worktree & branch, following [AGENTS.md](../AGENTS.md#worktree-isolation). Read-only delegates may
  inspect the orchestrator's checkout. The orchestrator retains the issue's `agent:*` label; commits
  keep the repository owner as author & add each material author's product-level `Co-Authored-By`
  trailer. A commit does not receive an `agent:*` label.
- **Orchestrator verifies.** Read the delegate's diff & run the focused checks before committing.

| Agent       | Command (non-interactive) | Limits                           | Notes                                                                                                                    |
| ----------- | ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | `claude -p "prompt"`      | Pro sub, 5-hour windows          | Sonnet by default. Opus on the maintainer's machine.                                                                     |
| Codex       | `codex exec "prompt"`     | Account-dependent                | Inherits the user's configured model & reasoning effort; this project does not pin either. `-c model="..."` to override. |
| Antigravity | `agy -p "prompt"`         | Free tier, weekly quotas         | Gemini 3.5 Flash default. Gemini and Claude/GPT quotas separate.                                                         |
| Kilo        | `kilo run "prompt"`       | Free, rate-limited               | Always use the default auto-free model.                                                                                  |
| Copilot     | `copilot -p "prompt"`     | Pro sub, 1500 monthly AI credits | Multi-model. Cheaper models use fewer credits.                                                                           |
| LM Studio   | `lms chat -p "prompt"`    | Unlimited (local)                | Qwen 3.5 27B. Slow, no tool use.                                                                                         |

## When to delegate vs. do it yourself

Delegation has overhead: crafting a prompt, spawning a process, waiting, parsing results. This
overhead often exceeds the cost of just doing the task.

**Do it yourself (at a cheaper model if needed) when:**

- The task would take fewer than ~3 turns
- The task requires your current conversation context
- The task uses your unique tools (MCP servers, browser automation, etc.)
- The user is iterating on feedback with you
- The output is small (a regex, a one-liner, a short explanation)

**Delegate when:**

- The task is well-defined and self-contained (no conversation context needed)
- The task would consume significant context (3+ turns, multi-file changes)
- The task is independent and can run in parallel with other work
- A different agent has more remaining quota for this type of work

**Never delegate:**

- Tasks requiring your unique integrations or tools
- Tasks where the user is mid-conversation and expecting continuity
- Security-sensitive operations the user hasn't explicitly authorized

## Delegation routing

### Tier 1 — Free / local

Use for well-defined tasks that don't need heavy reasoning:

- **Kilo** (`kilo run "prompt"`): Code tasks with tool use, file operations. Free but rate-limited.
- **LM Studio** (`lms chat -p "prompt"`): Text-only tasks (no tool use), summarization, formatting.
  Slow but unlimited.

### Tier 2 — Subscriptions with limited quotas

Use for substantial tasks that need strong reasoning:

- **Codex** (`codex exec "prompt"`): Multi-file changes, refactoring, code review. Limits depend on
  the signed-in account.
- **Antigravity** (`agy -p "prompt"`): Similar capability. Has separate Gemini vs Claude/GPT weekly
  quotas.
- **Copilot** (`copilot -p "prompt"`): Multi-model, GitHub-native tools.

### Tier 3 — Most capable

- **Claude Code** at Opus or **Codex** at Sol/Astra: Architecture, ambiguous requirements,
  orchestration, debugging hard problems.

## Proactive behavior

- **Propose delegation** when a task clearly fits a lower tier and would save significant usage (5+
  turns worth of work), then wait for the user's consent before spawning an external agent.
- **Mention delegation** when it's a judgment call or the savings are moderate (3-5 turns).
- **Keep it yourself** when delegation overhead would exceed the savings.

## Session lifecycle

Session budgets, handoff notes, and the stop rule live in
[session policy](../AGENTS.md#session-economy). When a usage window is about to close, write the
handoff note, then stop. If the harness can schedule a follow-up (for example, Claude Code's
`ScheduleWakeup`), use it to start a fresh session in the next window; otherwise leave the handoff
for the user. Do not continue the current session after the cache has gone cold.

## Parallel dispatch

When you have 2+ independent tasks to delegate, dispatch them simultaneously. Don't serialize work
that can run in parallel. Processes can share Git refs, stashes, local files, & tools. Assign
disjoint ownership, isolate editing worktrees, and tell each delegate not to revert another agent's
edits.
