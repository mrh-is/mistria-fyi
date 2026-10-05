import { LOCALE_CODES } from "#lib/types/locale.js";

import { forEachItem } from "../extractor-helpers.js";
import { localizeField } from "../localize.js";

import type { SourceTuple } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  PetCosmeticSet,
  PetCosmeticSetId,
  PetSkin,
  PetSkinId,
} from "#lib/types/tracker-data.js";

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

export function extractPetSkins(
  fiddle: ParsedGameData,
  itemLocaleNames: Record<LocaleCode, Record<string, string>>,
): {
  localeNames: Record<LocaleCode, Record<PetSkinId, string>>;
  skins: Record<PetSkinId, PetSkin>;
} {
  const result = {} as Record<PetSkinId, PetSkin>;
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<PetSkinId, string>
  >;

  forEachItem(fiddle, (itemId, item) => {
    const skinUnlock = item.pet_skin_unlock as string | undefined;
    if (!skinUnlock) return;

    const skinId = skinUnlock as PetSkinId;
    result[skinId] = { sources: [] as unknown as SourceTuple };
    const englishName = itemLocaleNames.en[itemId];
    if (!englishName) throw new Error(`Pet skin "${skinUnlock}" has no localized item "${itemId}"`);
    for (const locale of LOCALE_CODES) {
      const name = itemLocaleNames[locale][itemId];
      if (!name) throw new Error(`Pet skin "${skinUnlock}" has no "${locale}" item name`);
      localeNames[locale][skinId] =
        locale === "en" || name === englishName ? name.replace(/^Pet Skin:\s*/i, "") : name;
    }
  });

  console.log(`  Pet skins: ${Object.keys(result).length}`);
  return { localeNames, skins: result };
}

function titleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
