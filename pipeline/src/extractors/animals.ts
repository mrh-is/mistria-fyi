import { LOCALE_CODES } from "#lib/types/locale.js";

import { expectNonEmptyString } from "../data-shapes.js";
import { sourceFileFor } from "../parse-fiddle.js";

import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  Animal,
  AnimalCosmetic,
  AnimalId,
  AnimalVariant,
  AnimalVariantId,
  AnimalVariantTier,
  CosmeticId,
} from "#lib/types/tracker-data.js";

import type { SourceDraft } from "../acquisition/required-sources.js";
import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

/** An `Animal` whose cosmetics' sources assembly has yet to attach & check. */
export type AnimalDraft = Omit<Animal, "cosmetics"> & {
  cosmetics: Record<CosmeticId, SourceDraft<AnimalCosmetic>>;
};

export interface AnimalExtraction {
  animals: Record<AnimalId, AnimalDraft>;
  localeNames: Record<LocaleCode, Record<string, string>>;
}

/**
 * Normalizes ranching.animals into tracker species, omitting template and non-acquirable variants.
 * Variants are grouped into tiers; default-unlocked variants always land in tier 1.
 */
export function extractAnimals(fiddle: ParsedGameData, localizer: Localizer): AnimalExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const ranching = fiddle.ranching as Record<string, unknown> | undefined;
  const animals = ranching?.animals as Record<string, Record<string, unknown>> | undefined;
  if (!animals) return { animals: {}, localeNames };

  const result = {} as Record<AnimalId, AnimalDraft>;
  let skippedVariants = 0;

  for (const [id, animal] of Object.entries(animals)) {
    if (id === "default") continue;

    const sourcePath = sourceFileFor(fiddle, `ranching.animals.${id}`);

    const core = animal.core as Record<string, unknown> | undefined;
    const rawVariants = animal.variants as Record<string, Record<string, unknown>> | undefined;
    const rawCosmetics = animal.cosmetics as Record<string, Record<string, unknown>> | undefined;

    const tierBuckets = new Map<number, Record<AnimalVariantId, AnimalVariant>>();
    if (rawVariants) {
      for (const [vid, v] of Object.entries(rawVariants)) {
        if (vid === "default") {
          skippedVariants++;
          continue;
        }
        if ((v.acquirable as boolean | undefined) === false) {
          skippedVariants++;
          continue;
        }
        const isDefaultUnlocked = (v.default_unlocked as boolean | undefined) ?? false;
        const tier = isDefaultUnlocked ? 1 : ((v.tier as number | undefined) ?? 1);
        const source: Extract<Source, { type: "breed" | "default" }> = isDefaultUnlocked
          ? { type: "default" }
          : { type: "breed" };

        const bucket = tierBuckets.get(tier) ?? {};
        if (!tierBuckets.has(tier)) tierBuckets.set(tier, bucket);
        const name = expectNonEmptyString(v.name, {
          entityId: `ranching.animals.${id}.variants.${vid}`,
          fieldPath: "name",
          sourcePath,
        });
        bucket[vid as AnimalVariantId] = { source };
        localizeAnimalName(localeNames, localizer, id, "variants", vid, name);
      }
    }

    const sortedTiers = [...tierBuckets.entries()].toSorted(([a], [b]) => a - b);
    const variantTiers: AnimalVariantTier[] = sortedTiers.map(([, bucket]) => bucket);

    const speciesName = expectNonEmptyString(core?.name, {
      entityId: `ranching.animals.${id}.core`,
      fieldPath: "name",
      sourcePath,
    });
    localizeAnimalName(localeNames, localizer, id, "core", undefined, speciesName);
    const breedCosmetics = new Set<string>();
    if (rawVariants) {
      for (const [vid, v] of Object.entries(rawVariants)) {
        if (vid === "default") continue;
        const defaultCosmetic = v.default_cosmetic as string | undefined;
        if (defaultCosmetic) {
          breedCosmetics.add(defaultCosmetic);
        }
      }
    }

    const cosmetics = {} as Record<CosmeticId, SourceDraft<AnimalCosmetic>>;
    if (rawCosmetics) {
      for (const [cid, c] of Object.entries(rawCosmetics)) {
        if (cid === "default") continue;
        const rawName = expectNonEmptyString(c.name, {
          entityId: `ranching.animals.${id}.cosmetics.${cid}`,
          fieldPath: "name",
          sourcePath,
        });
        const stripped = rawName.replace(new RegExp(`\\b${speciesName}\\b\\s*`, "i"), "").trim();
        const sources: Source[] = breedCosmetics.has(cid) ? [{ type: "breed" }] : [];
        cosmetics[cid as CosmeticId] = { sources };
        localizeAnimalName(localeNames, localizer, id, "cosmetics", cid, stripped || rawName);
      }
    }

    result[id as AnimalId] = {
      cosmetics,
      variantTiers,
    };
  }

  const totalVariants = Object.values(result).reduce(
    (n, a) => n + a.variantTiers.reduce((m, t) => m + Object.keys(t).length, 0),
    0,
  );
  console.log(
    `  Animals: ${Object.keys(result).length} types, ` +
      `${totalVariants} variants ` +
      `(${skippedVariants} template/unacquirable variants skipped), ` +
      `${Object.values(result).reduce((n, a) => n + Object.keys(a.cosmetics).length, 0)} cosmetics`,
  );
  return { animals: result, localeNames };
}

function localizeAnimalName(
  localeNames: Record<LocaleCode, Record<string, string>>,
  localizer: Localizer,
  animalId: string,
  section: "core" | "cosmetics" | "variants",
  id: string | undefined,
  englishValue: string,
): void {
  const { values } = localizer.localizeField({
    category: `ranching/animals/${animalId}`,
    classification: "localizable",
    englishValue,
    field: "name",
    id: id ? `${section}/${id}` : section,
  });
  const key = id ? `${animalId}/${section}/${id}` : `${animalId}/${section}`;
  for (const locale of LOCALE_CODES) localeNames[locale][key] = values[locale];
}
