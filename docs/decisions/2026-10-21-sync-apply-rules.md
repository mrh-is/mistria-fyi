# Sync apply rules

## Context

Sync (#123) applies each save the PC courier sends onto the phone's stored progress without the
player in the loop, so every difference needs a policy: apply silently, apply & tell, ask first, or
keep local & tell. The epic fixes the ordering rules, the guardrails, & farm identity, but leaves
open how the table is keyed, which quest kinds a save may lower, what “a handful” is, what happens
to edits that can't be ordered, & how a farm switch keeps its backup in the same write.

## Decision

- **One pure function, `applySync`, in `src/lib/engine/sync-apply.ts`.** It returns either the open
  questions or a result: every difference with its policy & whether it was written, the next state,
  the outgoing state on a farm switch, & the save's unknown IDs. The receiver re-calls it with the
  answers, so recomputing a question whose effect changed needs no extra machinery: question IDs
  name the changes they cover.
- **The table is keyed by provenance, fact kind, & direction.** Kinds are ticks, levels (seasons
  included), & quests. A save or inference yields to the save; a manual edit is ordered by
  `playtime`; `unknown` lets the save add a fact at its default but asks before replacing, removing,
  or lowering one. The guardrails run after the table: any level decrease asks unless a manual level
  beats the save, & more than five removals (`REMOVAL_HANDFUL`) in one bundle all ask.
- **An edit that can't be ordered asks.** A manual edit with no playtime (none had been applied) or
  a save whose playtime couldn't be read is treated like `unknown`: removals & disagreements ask,
  per field. Letting an unordered save win would undo the player's own edits on a guess.
- **Every tracked quest kind may be lowered by a complete save.** In v1.0.8 `QuestLog.complete` is
  the only path into `completed_quests` & out of `active_quests`, & a late-game save's
  `quest_<id>_complete` facts match its list for every kind. `QUEST_KINDS_LISTED_AS_COMPLETED` keeps
  the per-kind switch so a game update can take one out. Pregnancy quests follow the household,
  which stays manual.
- **Questions come in stages:** the farm, then an older save, then every field at once, because each
  answer changes what the next stage would ask.
- **A farm switch is one stored document.** `serializeFarmSwitch` writes the new farm's progress
  with the outgoing farm's backup in `local.farmSwitchBackup`, in the restorable backup format,
  which never holds a `local` section, so the backup can't nest. It refuses (returns `null`) when
  the backup wouldn't restore; one `setItem` then lands both or neither.

## Alternatives

- **Key the table by provenance & fact kind only, with direction left to guardrails.** Rejected:
  `unknown` must add but never remove, which is a direction rule, and spelling direction out keeps
  the table the single place to read a policy.
- **Let a save without a readable playtime win as a newer save.** Rejected: a rollback with a
  damaged header would then silently undo manual edits.
- **Ask about every quest decrease.** Rejected for v1.0.8: the game's list is reliable for every
  kind, and asking would turn each legitimate rollback into extra questions.
- **Store the farm-switch backup under its own storage key.** Rejected: two writes can half-land,
  which the epic rules out.

## Revisit if

- A game update records a quest kind's completions somewhere other than `completed_quests`.
- Real sync logs show the five-removal threshold firing on ordinary play, or missing a rename.
- Public #6 extracts household facts, which then join the comparison.
- Multi-farm profiles replace the single farm-switch backup.
