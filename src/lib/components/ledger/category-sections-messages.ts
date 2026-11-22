import { trackerData } from "#lib/data/index.js";
import { animalNameId, getName, nameCollator } from "#lib/data/names.js";
import { isDoableToday } from "#lib/engine/availability.js";
import { recipePlacements } from "#lib/engine/projections/recipes.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { inLocale } from "#lib/i18n/locale-runtime.js";
import { ledgerPlacement } from "#lib/presentation/ledger.js";
import { recordEntries } from "#lib/utils/record.js";

import type { SourceChecklistRow } from "#lib/controllers/source-checklist.js";
import type { ProgressContext } from "#lib/engine/progress.js";
import type { LedgerPlacement } from "#lib/presentation/ledger.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { CosmeticSlot, QuestType } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

export type LedgerCategory = "animals" | "cosmetics" | "museum" | "quests" | "recipes";

type CategoryRow = LedgerPlacement & SourceChecklistRow;

export interface CategorySection {
  id: string;
  name: string;
  progress: { completed: number; total: number };
  rows: CategoryRow[];
  spoilered?: boolean;
  subsections?: CategorySection[];
}

const slotLabels: Partial<Record<CosmeticSlot, () => string>> = {
  back: () => "Back",
  bottom: () => "Bottoms",
  face_gear: () => "Face gear",
  feet: () => "Shoes",
  hair: () => "Hair",
  head_gear: () => "Head gear",
  top: () => "Tops",
};

const animalLabels = {
  appearances: () => "Appearances",
  colors: () => "Colors",
  cosmetics: () => "Cosmetics",
  perks: () => "Perks",
  petCosmetics: () => "Pet cosmetics",
  petSkins: () => "Pet skins",
};

function questLabel(type: QuestType, locale: LocaleCode): string {
  switch (type) {
    case "cooking":
      return getName("ui", "cooking_challenges", locale);
    case "crown":
      return getName("ui", "crown_requests", locale);
    case "fetch":
      return "Fetch quests";
    case "heart":
      return getName("ui", "heart_quests", locale);
    case "mission":
      return getName("ui", "mission_quests", locale);
    case "story":
      return getName("ui", "story_quests", locale);
  }
}

export function categorySections(
  category: LedgerCategory,
  entries: readonly SourceChecklistRow[],
  ctx: ProgressContext,
  locale: LocaleCode,
): CategorySection[] {
  const collator = nameCollator(locale);
  const compare = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);
  const visibility = ctx.progressionState;
  const rows = entries.map((entry): CategoryRow => {
    // The section handles species and quest-type gates. A revealed section still covers entries
    // with their own unmet gates and the check-off still uses the original visibility condition.
    let ownGate = entry.visibility;
    if (entry.category === "quests") ownGate = entry.questVisibility;
    if (entry.reportCategory === "animal-variants" || entry.reportCategory === "animal-cosmetics") {
      ownGate = undefined;
    }
    return {
      ...entry,
      ...ledgerPlacement(entry.sources, ctx, visibility, {
        completed: entry.completed,
        doable: entry.obtainable && !entry.locked && isDoableToday(entry, ctx),
        spoilered: entry.spoilered === true || !isConditionVisible(ownGate, visibility),
      }),
      sources: entry.sources,
    };
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  function group(
    id: string,
    name: string,
    placements: readonly (CategoryRow | undefined)[],
    subsections?: CategorySection[],
    gate?: VisibilityCondition,
  ): CategorySection {
    const members = placements.filter((row) => row !== undefined);
    const obtainable = members.filter((row) => row.obtainable);
    return {
      id,
      name,
      progress: {
        completed: obtainable.filter((row) => row.completed).length,
        total: obtainable.length,
      },
      rows: members,
      spoilered: !isConditionVisible(gate, visibility),
      subsections: subsections?.filter((section) => section.rows.length > 0).toSorted(compare),
    };
  }

  function parent(
    id: string,
    name: string,
    subsections: CategorySection[],
    gate?: VisibilityCondition,
  ) {
    return group(
      id,
      name,
      subsections.flatMap((section) => section.rows),
      subsections,
      gate,
    );
  }

  function sections(): CategorySection[] {
    switch (category) {
      case "museum":
        return recordEntries(trackerData.museum).map(([id, wing]) =>
          parent(
            id,
            getName("museum_wings", id, locale),
            recordEntries(wing.sets).map(([setId, set]) =>
              group(
                `${id}-${setId}`,
                getName("museum_wings", `${id}/sets/${setId}`, locale),
                set.items
                  .map((item) => byId.get(item))
                  .toSorted((a, b) => (a && b ? compare(a, b) : 0)),
              ),
            ),
          ),
        );
      case "animals": {
        const animals = recordEntries(trackerData.animals).map(([id, animal]) => {
          const members = rows.filter((row) => row.id.startsWith(`${id}/`));
          return parent(
            id,
            getName("animals", animalNameId(id, "core"), locale),
            [
              group(
                `${id}-colors`,
                animalLabels.colors(),
                members.filter((row) => row.reportCategory === "animal-variants"),
              ),
              group(
                `${id}-cosmetics`,
                animalLabels.cosmetics(),
                members
                  .filter((row) => row.reportCategory === "animal-cosmetics")
                  .toSorted(compare),
              ),
            ],
            animal.visibility,
          );
        });
        return [
          ...animals,
          parent("mount", getName("ui", "mount", locale), [
            group(
              "mount-appearances",
              animalLabels.appearances(),
              rows.filter((row) => row.reportCategory === "mount-appearance").toSorted(compare),
            ),
            group(
              "mount-perks",
              animalLabels.perks(),
              rows.filter((row) => row.reportCategory === "mount-perk").toSorted(compare),
            ),
          ]),
          group(
            "pet-cosmetics",
            animalLabels.petCosmetics(),
            rows.filter((row) => row.reportCategory === "pet-cosmetic"),
          ),
          group(
            "pet-skins",
            animalLabels.petSkins(),
            rows.filter((row) => row.reportCategory === "pet-skin"),
          ),
        ];
      }
      case "cosmetics":
        return recordEntries(trackerData.cosmeticSlots).map(([id, { subCategories }]) => {
          const slotRows = recordEntries(trackerData.cosmetics).filter(
            ([, item]) => item.slot === id,
          );
          const subsections = subCategories.map((sub) =>
            group(
              `${id}-${sub}`,
              getName("cosmetics/subcategories", sub, locale),
              slotRows
                .filter(([, item]) => item.subCategory === sub)
                .flatMap(([key]) => byId.get(key) ?? [])
                .toSorted(compare),
            ),
          );
          if (subsections.length === 1) return group(id, subsections[0].name, subsections[0].rows);
          const label = slotLabels[id];
          if (!label) throw new Error(`Missing heading for cosmetic slot ${id}`);
          return parent(id, label(), subsections);
        });
      case "recipes":
        return recipePlacements().map(({ categoryId, recipes }) =>
          group(
            categoryId,
            getName("ui", categoryId, locale),
            recipes
              .flatMap(({ itemId, recipeId }) => {
                const recipe = byId.get(recipeId);
                return recipe
                  ? [{ ...recipe, name: getName("items", itemId, locale), sprite: itemId }]
                  : [];
              })
              .toSorted(compare),
          ),
        );
      case "quests":
        return recordEntries(trackerData.quests).map(([type]) =>
          group(
            type,
            questLabel(type, locale),
            rows.filter((row) => row.questType === type),
            undefined,
            trackerData.categoryVisibility[type],
          ),
        );
    }
  }

  return inLocale(locale, sections)
    .filter((section) => section.rows.length > 0)
    .toSorted(compare);
}
