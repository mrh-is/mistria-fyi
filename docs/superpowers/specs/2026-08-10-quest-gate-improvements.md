# Quest-gate improvements

## Context

The harvest-helper app shows which quests must be completed before items, animals, or spells become
available. The v0.13.4 pipeline inferred these gates by tracing through cutscenes: find cutscenes
that unlock progression flags, map those flags to store item requirements, and resolve the cutscene
back to its quest.

In v1.0.2, the data model changed significantly:

- `cutscene.progression_unlocks` no longer exists
- Store items use a typed `requirements` system instead of `has_perk`, `building_fixed`, etc.
- Animal availability moved from `core.progression_requirement` to `core.requirements`
- Requirements are defined in `requirements.toml` with ~50 named types that can be composed with
  `or`, `invert`, arrays, and nested references

The pipeline v2 migration adds a requirements parser/resolver that handles the typed requirement
system for store restrictions, but the quest-gate _inference_ (tracing from a requirement back to
the quest that satisfies it) needs deeper work.

## Current state after pipeline v2

After the pipeline migration:

- The requirements resolver can parse and validate all requirement shapes
- Store restrictions correctly map requirements to display-friendly restriction types
- Direct quest evidence is preserved (quest rewards that grant items)
- Indirect inference (requirement → cutscene → quest) is removed because the old tracing paths
  (`progression_unlocks`, `quest_is_completed`) don't exist in v1.0.2

## What to investigate

### Requirement → quest mapping

The core question: given a store item requirement like `repaired_general_store = true`, which
resolves (via `requirements.toml`) to `seen_cutscene = "repair_the_general_store_pt_2"`, can we
reliably map that cutscene back to a quest?

Known fields that could establish the link:

- `cutscene.quest_to_progress` — names the quest this cutscene advances
- `cutscene.quest_to_start` — names the quest this cutscene begins
- `quest.stages[].queries[].cutscene` — cutscenes triggered by quest stages
- `quest.stages[].queries[].npc_conversation` — NPC conversations in quest stages

### Scope of requirement types used by tracked entities

Not all 50+ requirement types matter for the tracker. Catalog which requirement predicates actually
appear on:

- Store stock entries (items and cosmetics)
- Animal `core.requirements`
- Any other tracked entity that should show quest gates

### Boolean composition

Requirements can compose: `or` arrays, `invert` wrappers, nested named requirements. The quest-gate
UI needs to handle these — "requires quest A OR quest B" is different from "requires quest A AND
quest B."

## Scope boundaries

- Full investigation of requirement → quest mapping: in scope
- Implementing reliable inference where the data supports it: in scope
- UI for composite quest gates (OR/AND): in scope
- Inventing quest edges where the data provides no direct link: out of scope
- Quest-gate tracking for recipe acquisition (covered by recipe-tracking spec): out of scope

## Dependencies

- Requires the pipeline v2 TOML migration to be complete
- Requires the requirements resolver from that migration
- May inform recipe tracking (some recipe unlocks are quest-gated)
