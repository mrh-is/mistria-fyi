# Sources name quests, not cutscenes

## Context

The Mistmare unlocks when `obj_horse_statue.gml` plays `reveal_mistmare`, and the statue only
appears after `find_the_weathervane_setup`. A source reading “see the reveal_mistmare cutscene”
tells a player nothing they can act on; “start the Find the Weathervane quest” does.

## Decision

Acquisition sources map a cutscene back to the quest that leads to it, through the cutscene-quest
map or a reviewed `CUTSCENE_QUEST_ENTRIES` entry, and render the quest. The cutscene-quest map now
also resolves setup scenes: a scene named by a quest-starting scene's `requirements.seen_cutscene`
maps to that quest becoming available. A `cutscene` source is the fallback for scenes no quest leads
to. #90 audits the existing cutscene sources against this rule.

## Alternatives

- **Name the cutscene with its own message.** Rejected as the default: the game names no cutscene,
  and players navigate by quests.
- **Hand-review each setup scene.** Rejected: the `seen_cutscene` link is native data, and deriving
  it covers future setup scenes too.

## Revisit if

- A game update starts quests from scenes the map can't trace, or names its cutscenes in UI.
