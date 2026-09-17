import { LOCALE_CODES } from "$lib/types/locale.js";

import { forEachItem } from "../extractor-helpers.js";
import { localizeField } from "../localize.js";

import type { SourceTuple } from "$lib/types/acquisition.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type {
  PetCosmeticSet,
  PetCosmeticSetId,
  PetSkin,
  PetSkinId,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractPetCosmetics(
  fiddle: ParsedGameData,
  assetsDir: string,
): {
  cosmetics: Record<PetCosmeticSetId, PetCosmeticSet>;
  localeNames: Record<LocaleCode, Record<PetCosmeticSetId, string>>;
} {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<PetCosmeticSetId, string>
  >;
  const pets = fiddle.pets as Record<string, unknown> | undefined;
  const sets = pets?.cosmetic_sets as Record<string, Record<string, unknown>> | undefined;
  if (!sets) return { cosmetics: {}, localeNames };

  const result = {} as Record<PetCosmeticSetId, PetCosmeticSet>;
  for (const [id, set] of Object.entries(sets)) {
    const name = (set.name as string | undefined) ?? titleCase(id);
    result[id as PetCosmeticSetId] = { sources: [] as unknown as SourceTuple };
    const { values } = localizeField(assetsDir, {
      category: "pets/cosmetic_sets",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][id as PetCosmeticSetId] = values[locale];
  }

  console.log(`  Pet cosmetic sets: ${Object.keys(result).length}`);
  return { cosmetics: result, localeNames };
}

export function extractPetSkins(fiddle: ParsedGameData): Record<PetSkinId, PetSkin> {
  const result = {} as Record<PetSkinId, PetSkin>;

  forEachItem(fiddle, (_itemId, item) => {
    const skinUnlock = item.pet_skin_unlock as string | undefined;
    if (!skinUnlock) return;

    const rawName = (item.name as string | undefined) ?? skinUnlock;
    const name = rawName.replace(/^Pet Skin:\s*/i, "");
    result[skinUnlock as PetSkinId] = { name, sources: [] as unknown as SourceTuple };
  });

  console.log(`  Pet skins: ${Object.keys(result).length}`);
  return result;
}

function titleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
