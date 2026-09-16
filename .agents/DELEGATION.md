# Multi-Agent Delegation Guide

This file defines how agents in this system should conserve usage by routing to the cheapest capable
model and delegating to other agents when appropriate.

Every agent reading this file is part of the same fleet. You are expected to understand your own
identity and capabilities, and to route work efficiently.

## Routing at session start

Evaluate the task before starting work. **The default is the cheapest capable model, not the most
powerful one.** Escalate only when the task demands it.

| Task type                                                 | Tier      | Claude          | Codex         |
| --------------------------------------------------------- | --------- | --------------- | ------------- |
| Lint fix, dependency update, doc edit, rename             | Cheap     | Haiku or Sonnet | Luna          |
| Bug fix, single-component feature, test addition          | Default   | Sonnet          | Luna or Terra |
| Multi-file feature, refactoring, CI investigation         | Mid       | Sonnet or Opus  | Terra or Sol  |
| Architecture, difficult debugging, ambiguous requirements | Expensive | Opus            | Sol or Astra  |
| Design work, visual iteration, complex UI                 | Expensive | Opus            | Sol           |

To switch models mid-session:

- **Claude Code**: `/model <model-id>` or `set_session_model`
- **Claude subagents**: `model: "sonnet"` / `model: "haiku"` in the Agent tool
- **Codex**: `-c model="<model-id>"`

## The fleet

All agents are on free or subscription tiers with usage limits (except LM Studio which is
local/unlimited). Treat every agent's usage as a shared budget — conserve across the board.

| Agent       | Command (non-interactive)               | Limits                           | Notes                                                                                 |
| ----------- | --------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| Claude Code | `claude -p "prompt"`                    | Pro sub, 5-hour windows          | Default Sonnet (this project), Opus (machine).                                        |
| Codex       | `codex exec "prompt"`                   | Free tier                        | Default Terra (this project, see `.codex/config.toml`). `-c model="..."` to override. |
| Antigravity | `agy -p "prompt"`                       | Free tier, weekly quotas         | Gemini 3.5 Flash default. Gemini and Claude/GPT quotas separate.                      |
| Kilo        | `kilo run "prompt" --auto`              | Free, rate-limited               | Always use the default auto-free model.                                               |
| Copilot     | `copilot -p "prompt" --allow-all-tools` | Pro sub, 1500 monthly AI credits | Multi-model. Cheaper models use fewer credits.                                        |
| LM Studio   | `lms chat -p "prompt"`                  | Unlimited (local)                | Qwen 3.5 27B. Slow, no tool use.                                                      |

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

- **Kilo** (`kilo run "prompt" --auto`): Code tasks with tool use, file operations. Free but
  rate-limited.
- **LM Studio** (`lms chat -p "prompt"`): Text-only tasks (no tool use), summarization, formatting.
  Slow but unlimited.

### Tier 2 — Subscriptions with limited quotas

Use for substantial tasks that need strong reasoning:

- **Codex** (`codex exec "prompt"`): Multi-file changes, refactoring, code review. Free tier.
- **Antigravity** (`agy -p "prompt"`): Similar capability. Has separate Gemini vs Claude/GPT weekly
  quotas.
- **Copilot** (`copilot -p "prompt" --allow-all-tools`): Multi-model, GitHub-native tools.

### Tier 3 — Most capable

- **Claude Code** at Opus or **Codex** at Sol/Astra: Architecture, ambiguous requirements,
  orchestration, debugging hard problems.

## Proactive behavior

- **Auto-delegate silently** when a task clearly fits a lower tier and would save significant usage
  (5+ turns worth of work).
- **Suggest delegation** when it's a judgment call or the savings are moderate (3-5 turns).
- **Keep it yourself** when delegation overhead would exceed the savings.

## Session lifecycle

When approaching the 5-hour usage window limit or sensing rate-limiting:

1. Write remaining work to a handoff note (branch, issue #, current state)
2. Use `ScheduleWakeup` to schedule a fresh session within the next usage window
3. Do NOT continue the current session after the cache has gone cold

A fresh session reading the issue and branch is 50–100x cheaper than re-tokenizing a cold
conversation. See [AGENTS.md](../AGENTS.md) §10.

## Parallel dispatch

When you have 2+ independent tasks to delegate, dispatch them simultaneously. Don't serialize work
that can run in parallel. Each agent runs in its own process with no shared state, so independence
is the only requirement.
