import { LOCALE_CODES } from "#lib/types/locale.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { MonsterId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";

/**
 * English monster names, reviewed by hand. The game names a monster only through the `pets.toml`
 * variant it becomes as a pet (a monster's base `main` sprite matches its pet kind's base variant,
 * and a colored monster the same-colored variant). Through game 1.0.6 each variant carried the full
 * name; 1.0.7 cut them to bare qualifiers ("Copper", "Grey", "Default") shown under the pet kind, so
 * these keep the 1.0.6 names players know.
 */
export const MONSTER_NAMES: Readonly<Record<string, string>> = {
  bat: "Essence Bat",
  bat_blue: "Blue Essence Bat",
  cat: "Lava Cat",
  cat_void: "Void Cat",
  copperclod: "Copperclod",
  enchantern: "Yellow Enchantern",
  enchantern_blue: "Blue Enchantern",
  goldclod: "Goldclod",
  griffin_statue: "Gryphon Statue",
  ironclod: "Ironclod",
  mimic: "Mimic",
  mushroom: "Mushroom",
  mushroom_blue: "Blue Mushroom",
  mushroom_green: "Green Mushroom",
  mushroom_purple: "Purple Mushroom",
  rock_stack: "Rock Stack",
  rockclod: "Rockclod",
  rockclod_blue: "Blue Rockclod",
  rockclod_green: "Green Rockclod",
  rockclod_red: "Red Rockclod",
  sapling: "Green Sapling",
  sapling_blue: "Blue Sapling",
  sapling_cool: "Cool Sapling",
  sapling_orange: "Orange Sapling",
  sapling_pink: "Pink Sapling",
  sapling_purple: "Purple Sapling",
  silverclod: "Silverclod",
  spirit: "Orange Flame Spirit",
  spirit_purple: "Purple Flame Spirit",
  stalagmite: "Stalagmite",
  stalagmite_green: "Green Stalagmite",
  stalagmite_purple: "Purple Stalagmite",
  tome: "Flying Tome",
};

/**
 * Monsters with no pet variant, so the game never named them. The app composes their name from
 * the pet skin family and a variant qualifier (`src/lib/sources/source-names.ts`).
 */
export const MONSTERS_WITHOUT_PET_VARIANT: readonly string[] = [
  "mistrilclod",
  "rockclod_purple",
  "sapling_orange_mini",
];

/**
 * English monster names from {@link MONSTER_NAMES}. The game never translates these, so every
 * locale carries the English name, keeping the chunk key-complete; the app reads them for English
 * only (see `buildMonsterNames`). Throws when a monster is unclassified, so a game update can't
 * silently drop a name. `monsters.assets.test.ts` checks the reverse: every reviewed id is still a
 * game monster.
 */
export function extractMonsterNames(
  fiddle: ParsedGameData,
): Record<LocaleCode, Record<MonsterId, string>> {
  const monsters = fiddle.monsters as Record<string, Record<string, unknown>> | undefined;
  if (!monsters) throw new Error("The fiddle has no monsters table");

  const names = {} as Record<MonsterId, string>;
  for (const monstersOfType of Object.values(monsters)) {
    for (const monsterId of Object.keys(monstersOfType)) {
      if (monsterId === "default") continue;
      if (MONSTERS_WITHOUT_PET_VARIANT.includes(monsterId)) continue;

      const name = MONSTER_NAMES[monsterId];
      if (!name) throw new Error(`Monster "${monsterId}" has no reviewed name`);
      names[monsterId as MonsterId] = name;
    }
  }

  console.log(`  Monster names: ${Object.keys(names).length}`);
  return Object.fromEntries(LOCALE_CODES.map((locale) => [locale, { ...names }])) as Record<
    LocaleCode,
    Record<MonsterId, string>
  >;
}
