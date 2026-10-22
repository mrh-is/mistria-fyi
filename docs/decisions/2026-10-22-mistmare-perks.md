# The Mistmare's perks live in the Mount section

## Context

`ui/skill_menu/mount.toml` lists three perks (Horsepower, Harvest Horse, & Nice Ride) that the Horse
Statue sells for essence. No skill in `skills.toml` names that menu, so the skills extractor skipped
them, and save import counted `horsepower`, `harvest_horse`, & `nice_ride` in `player.perks` as
known-but-untracked (#86).

## Decision

Tracker data has a `mount.perks` registry beside `mount.appearances`, extracted from the mount
menu's one tier. Each perk has a `horse_statue` source carrying that perk's own essence cost and the
quest that repairs the statue, so it shares the Mistmare's visibility. Names come from
`perks/<id>/name` and join the skill perks in the `perks` locale chunk.

Checking a Mistmare perk records it in the existing `unlockedPerks` progress set, which the game's
own `player.perks` list mirrors. Save import, backup restore, and transfer codes all accept the
three IDs through one `trackedPerkIds` list; the stored blob gains no field, so it needs no version
bump. Transfer codes bind to the build and simply gain three bits in the perk bitfield.

The animals page's Mount section lists the appearances, then the perks, and its count and the
animals category total include both. The skills screen stays limited to skill perk tiers.

## Alternatives

- **A separate `mountPerks` progress set.** Rejected: it would split one game list across two stored
  fields and need a storage schema change for no gain.
- **Leave the perks out of the animals totals.** Rejected: the section's own count would then
  disagree with the category total it rolls up into.

## Revisit if

- A game update adds a second tier to the mount menu (extraction throws until it is reviewed).
- The skills screen ever lists perks from every menu rather than per skill.
