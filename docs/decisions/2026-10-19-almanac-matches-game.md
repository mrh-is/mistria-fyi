---
id: 2026-10-19-almanac-matches-game
status: needs-review
summary: >-
  The game's own almanac code is the authority for almanac membership and completion. An entry is
  one `recipe_key` group within a category's tags (`AlmanacMenu.gml`), where `recipe_key` defaults
  to the item's ID, and completion comes from `items_acquired` alone. Acquiring any member marks the
  whole group (`mark_item_as_acquired` in `Ari.gml`), which canonical-ID normalization already
  mirrors.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-19-almanac-matches-game.md#decision
relationships: []
---

# Almanac follows the game's own rules

## Context

Importing a save marked the whole almanac complete (#11). The importer treated every key of
`items_sold` as discovered, but the game allocates that array with a `0` for every item, so every
save names every item. It also counted `recipes_created`, which can name an item the game's almanac
still shows as locked. Separately, the pipeline grouped almanac rows by recipe key and English name,
so single & double beds sharing one recipe became two rows. Against a late-game save, MFG showed
1,020 of 1,020 furniture where the game showed 711 of 1,017.

## Decision

The game's own almanac code is the authority for almanac membership and completion. An entry is one
`recipe_key` group within a category's tags (`AlmanacMenu.gml`), where `recipe_key` defaults to the
item's ID, and completion comes from `items_acquired` alone. Acquiring any member marks the whole
group (`mark_item_as_acquired` in `Ari.gml`), which canonical-ID normalization already mirrors.

Progress already stored from earlier imports is not migrated. Save import merges additively, so
affected players reset progress and import again.

## Alternatives

- **Count `items_sold` entries above zero.** Rejected: selling requires owning, so a positive count
  adds nothing `items_acquired` lacks, and keeping the field invites the same mistake.
- **Keep `recipes_created` as a discovery signal.** Rejected: the game doesn't count it, and the
  result disagrees with the in-game almanac.
- **Keep name-based grouping.** Rejected: it invented rows the game doesn't show and was never
  grounded in game code.
- **Migrate stored almanac progress.** Rejected: a migration can't tell false imported entries from
  rows a player checked by hand, so it would destroy real progress.

## Revisit if

- A game update changes `AlmanacMenu.gml`'s grouping or `Ari.gml`'s acquisition marking.
- The in-game almanac count disagrees with MFG for an imported save.
