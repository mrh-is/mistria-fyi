import { LOCALE_CODES } from "#lib/types/locale.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { MonsterId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * The `pets.toml` variant each monster becomes as a pet. The game links them only through sprites
 * and colors, so this is reviewed by hand: a monster's base (`main`) sprite matches its pet kind's
 * base variant, and a colored monster matches the same-colored variant.
 */
export const MONSTER_PET_VARIANTS: Readonly<Record<string, string>> = {
  bat: "essence_bat_purple",
  bat_blue: "essence_bat_blue",
  cat: "lava_cat",
  cat_void: "void_cat",
  copperclod: "copperclod",
  enchantern: "enchantern_yellow",
  enchantern_blue: "enchantern_blue",
  goldclod: "goldclod",
  griffin_statue: "griffin_statue",
  ironclod: "ironclod",
  mimic: "mimic",
  mushroom: "mushroom_red",
  mushroom_blue: "mushroom_blue",
  mushroom_green: "mushroom_green",
  mushroom_purple: "mushroom_purple",
  rock_stack: "rock_stack",
  rockclod: "rockclod",
  rockclod_blue: "rockclod_blue",
  rockclod_green: "rockclod_green",
  rockclod_red: "rockclod_red",
  sapling: "sapling_green",
  sapling_blue: "sapling_blue",
  sapling_cool: "sapling_cool",
  sapling_orange: "sapling_orange",
  sapling_pink: "sapling_pink",
  sapling_purple: "sapling_purple",
  silverclod: "silverclod",
  spirit: "flame_spirit_orange",
  spirit_purple: "flame_spirit_purple",
  stalagmite: "stalagmite_blue",
  stalagmite_green: "stalagmite_green",
  stalagmite_purple: "stalagmite_purple",
  tome: "flying_tome",
};

/**
 * Monsters with no pet variant, so the game names them nowhere. The app composes their name from
 * the pet skin family and a variant qualifier (`src/lib/sources/source-names.ts`).
 */
export const MONSTERS_WITHOUT_PET_VARIANT: readonly string[] = [
  "mistrilclod",
  "rockclod_purple",
  "sapling_orange_mini",
];

/**
 * English monster names from their pet variants' `name` fields. The game never translates these,
 * so every locale carries the English name, keeping the chunk key-complete; the app reads them for
 * English only (see `buildMonsterNames`). Throws when a monster is unclassified or its variant is
 * missing, so a game update can't silently drop a name. `monsters.assets.test.ts` checks the
 * reverse: every reviewed id is still a game monster.
 */
export function extractMonsterNames(
  fiddle: ParsedGameData,
): Record<LocaleCode, Record<MonsterId, string>> {
  const pets = fiddle.pets as Record<string, unknown> | undefined;
  const variants = pets?.variants as Record<string, Record<string, unknown>> | undefined;
  const monsters = fiddle.monsters as Record<string, Record<string, unknown>> | undefined;
  if (!variants) throw new Error("The fiddle has no pets.variants table");
  if (!monsters) throw new Error("The fiddle has no monsters table");

  const names = {} as Record<MonsterId, string>;
  for (const monstersOfType of Object.values(monsters)) {
    for (const monsterId of Object.keys(monstersOfType)) {
      if (monsterId === "default") continue;
      if (MONSTERS_WITHOUT_PET_VARIANT.includes(monsterId)) continue;

      const variantId = MONSTER_PET_VARIANTS[monsterId];
      if (!variantId) throw new Error(`Monster "${monsterId}" has no reviewed pet variant`);
      const name = variants[variantId]?.name;
      if (typeof name !== "string" || !name) {
        throw new Error(
          `Monster "${monsterId}" maps to pet variant "${variantId}", which is unnamed`,
        );
      }
      names[monsterId as MonsterId] = name;
    }
  }

  console.log(`  Monster names: ${Object.keys(names).length}`);
  return Object.fromEntries(LOCALE_CODES.map((locale) => [locale, { ...names }])) as Record<
    LocaleCode,
    Record<MonsterId, string>
  >;
}
