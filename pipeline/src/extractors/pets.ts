import { LOCALE_CODES } from "#lib/types/locale.js";

import { forEachItem, titleCase } from "../extractor-helpers.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type {
  PetCosmeticSet,
  PetCosmeticSetId,
  PetSkin,
  PetSkinId,
} from "#lib/types/tracker-data.js";

import type { SourceDraft } from "../acquisition/required-sources.js";
import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

export function extractPetCosmetics(
  fiddle: ParsedGameData,
  localizer: Localizer,
): {
  cosmetics: Record<PetCosmeticSetId, SourceDraft<PetCosmeticSet>>;
  localeNames: Record<LocaleCode, Record<PetCosmeticSetId, string>>;
} {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<PetCosmeticSetId, string>
  >;
  const pets = fiddle.pets as Record<string, unknown> | undefined;
  const sets = pets?.cosmetic_sets as Record<string, Record<string, unknown>> | undefined;
  if (!sets) return { cosmetics: {}, localeNames };

  const result = {} as Record<PetCosmeticSetId, SourceDraft<PetCosmeticSet>>;
  for (const [id, set] of Object.entries(sets)) {
    const name = (set.name as string | undefined) ?? titleCase(id);
    result[id as PetCosmeticSetId] = { sources: [] };
    const { values } = localizer.localizeField({
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

/**
 * Every locale names a pet skin item “<Pet Skin>: <name>”, with its own translation of the label
 * and an ASCII or full-width colon (“Apparence d'animal : magmatou”, “ペットスキン：ナエネミー”).
 */
const PET_SKIN_ITEM_PREFIX = /^[^:：]+[:：]\s*/u;

export function extractPetSkins(
  fiddle: ParsedGameData,
  itemLocaleNames: Record<LocaleCode, Record<string, string>>,
): {
  localeNames: Record<LocaleCode, Record<PetSkinId, string>>;
  skins: Record<PetSkinId, SourceDraft<PetSkin>>;
} {
  const result = {} as Record<PetSkinId, SourceDraft<PetSkin>>;
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<PetSkinId, string>
  >;

  forEachItem(fiddle, (itemId, item) => {
    const skinUnlock = item.pet_skin_unlock as string | undefined;
    if (!skinUnlock) return;

    const skinId = skinUnlock as PetSkinId;
    result[skinId] = { sources: [] };
    for (const locale of LOCALE_CODES) {
      const name = itemLocaleNames[locale][itemId];
      if (!name) throw new Error(`Pet skin "${skinUnlock}" has no "${locale}" item name`);
      const skinName = name.replace(PET_SKIN_ITEM_PREFIX, "");
      if (skinName === name || !skinName) {
        throw new Error(`Pet skin item "${itemId}" has no "Pet Skin:" prefix in "${locale}"`);
      }
      // The game lowercases the name after the label (“jeune pousse”); it stands alone here.
      localeNames[locale][skinId] =
        skinName.charAt(0).toLocaleUpperCase(locale) + skinName.slice(1);
    }
  });

  console.log(`  Pet skins: ${Object.keys(result).length}`);
  return { localeNames, skins: result };
}
