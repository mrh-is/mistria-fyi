# Source names the game doesn't translate

## Context

#356 set out to replace interim machine-translated source names (locations, water types, & monster
variants) with the game's own translations. The game assets only partly cover them:

- Six source locations have translated `locations/<id>/name` keys. `farm`, `mines`, & `dungeon` have
  none.
- Water types (`ocean`, `pond`, `river`) have no keys at all.
- Monster names exist only as English `name` fields on `fiddle/pets.toml` variants, which no
  translation table covers. Three monsters (`mistrilclod`, `rockclod_purple`, `sapling_orange_mini`)
  have no pet variant.

## Decision

Use game text wherever it exists, and keep machine translations only for the gaps:

- The pipeline emits a `locations` chunk; the six named source locations read it.
- The pipeline emits a `monsters` chunk from a reviewed monster → pet variant map
  (`pipeline/src/extractors/monsters.ts`). English reads it.
- Non-English locales compose a monster name from its translated `pets/skins` family and a
  `source_monster_variant_*` qualifier, as do the three monsters without a pet variant.
- `farm`, `mines`, `dungeon`, & water types keep their `source_location_*` & `source_water_*`
  messages.

The `monsters` chunk is English-filled in every locale to satisfy the key-complete chunk contract,
but only English reads it.

## Alternatives

- **English-fill everything:** show `pets.toml` names in every locale. Rejected because a translated
  family name plus a qualifier (“Magmatou”, “Jeune pousse (bleu)”) localizes more of the name.
- **Drop every machine translation:** show English for the gaps in every locale. Rejected for the
  same reason.
- **Defer until first-party text appears:** leaves the `cat` → Void Cat mislabel and the
  untranslated locations in place.

## Revisit if

- A game update adds translation keys for monsters, water types, or the unnamed locations.
- A game update adds pet variants for the three unnamed monsters.
