# Runtime-only sources get their real mechanism

## Context

#471: 12 source IDs had no name in any locale. Eleven were story quests the reviewed overrides
invented for runtime-only grants, and one was the `abyss` treasure-chest tier, which has no
`treasure_box_abyss` item. #389 pinned them in an `UNNAMED_SOURCE_IDS` allowlist that rendered
title-cased IDs (“Great Bird 0”). Tracing `seals.toml`, `cutscenes.toml`, and the decompiled GML
showed that none of them is a quest, and most have a precise mechanism the contract can express.

## Decision

Model each grant as what the game does, not as a named pseudo-quest:

- **Seal rubbings & the heart crystal:** `seals.toml` maps each seal cutscene to its quest, so the
  sources point at the real, game-named quests (`the_water_tablet`, `the_earth_tablet`,
  `breaking_the_fire_seal`, `breaking_the_ruins_seal`).
- **Cutscene grants** (`elsie_dating_tutorial` → Inn Menu, `great_bird_0` → Mystical Feather): a new
  `cutscene` source with reviewed, machine-translated wording per cutscene. They remain reviewed
  overrides; deriving every `given_items` grant natively is a separate follow-up.
- **Date inspiration items:** a new `date_inspiration_drop` source records the GML drop (Eastern
  Road dig sites, fishing at the Beach, Mines chests), gated on having any date and lacking the date
  the item unlocks.
- **Another Tower song crystal:** a `bell_tower_chest` source, matching `beach_cave_chest`
  (`obj_narrows_cave_chest.gml`, placed in `rm_bell_tower_f2`).
- **Balor's Crate & Ryis' Lumber:** cutscene props the game labels “This shouldn't be in your
  inventory...”; excluded from tracking.
- **`abyss` tier:** a reviewed tier → item mapping names it after the Abyssal Chest item.

`UNNAMED_SOURCE_IDS` is deleted; every source name now resolves or throws.

The same PR (#417) moves the English definite article for stores out of the tracker contract into
`src/lib/utils/en-grammar.ts`.

## Alternatives

- **Reuse game strings under the quest wording:** “Complete the Beach Date quest” misstates the
  mechanism. Rejected for correctness.
- **One generic `story_event` source with a machine-translated name per ID:** still hides the real
  mechanism and needs 12 translations instead of reusing game text.

## Revisit if

- The pipeline derives cutscene `given_items` natively; the two reviewed `cutscene` overrides then
  become redundant.
- A game update adds a `treasure_box_abyss` item or names for these cutscenes.
