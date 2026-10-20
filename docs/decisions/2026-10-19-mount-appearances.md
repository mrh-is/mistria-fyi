# Mount appearances are their own collection

## Context

Importing a save warned about `giant_chicken_gold` & `giant_chicken_white` under
`player.animal_variant_unlocks.horse` (#83). The game files the Mistmare's appearances beside the
horse's breeds, but marks them `acquirable = false` in `ranching/animals/horse.toml`, so the animals
extractor skipped them. They aren't horses the player breeds: the Big Egg unlocks the chickens, and
buying the Mistmare at the Horse Statue grants its default look.

## Decision

The tracker has a `mount.appearances` registry, extracted from the horse's unacquirable variants
with a reviewed unlock for each, and tracked in its own `mountAppearances` progress set. The animals
page lists them in a “Mount” section, named by the game's `misc_local/mount`. Save import routes a
horse variant ID to mount appearances when it isn't a breed, and marks the Mistmare once
`gamedata.scene_history` contains `reveal_mistmare`.

The section leaves room for the Mistmare's perks (Horsepower, Harvest Horse, & Nice Ride), which
belong there rather than on the skills screen; #86 adds them alongside the other skill perks.

`mountAppearances` is an optional field of the persisted blob, so earlier backups keep loading
without a version bump. Transfer codes bind to the build and simply gain a bitfield.

## Alternatives

- **Track them as horse variants.** Rejected: horse completion would then require items no horse
  breeding produces, and the variant tiers would gain entries with no tier.
- **Silence the warnings with a known-but-untracked list.** Rejected: these are real collectibles
  the player unlocks, and the in-game appearance menu lists them.
- **Infer the Mistmare from `player.mount`.** Rejected: that field mirrors whichever animal the
  player rides, while the reveal cutscene marks the unlock itself.

## Revisit if

- A game update adds unacquirable horse variants (extraction throws until each is reviewed) or moves
  mount appearances out of `animal_variant_unlocks.horse`.
- #86 adds perk tracking, at which point the Mount section gains the three Mistmare perks.
