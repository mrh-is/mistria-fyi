import { trackerData } from "#lib/data/index.js";
import { animalNameId, getAlmanacEntryNames, getName } from "#lib/data/names.js";
import { isAnimalVariantSpoilered } from "#lib/engine/animal-availability.js";
import { projectAlmanac } from "#lib/engine/projections/almanac.js";
import { projectAnimals } from "#lib/engine/projections/animals.js";
import { projectMuseum } from "#lib/engine/projections/museum.js";
import { recipePlacements } from "#lib/engine/projections/recipes.js";
import { factKey } from "#lib/engine/provenance.js";
import { buildQuestSections } from "#lib/presentation/quest-sections.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CategoryKey } from "#lib/engine/categories.js";
import type { ProgressContext } from "#lib/engine/progress.js";
import type { ReportCategory } from "#lib/feedback/types.js";
import type { SourceGroupRow } from "#lib/presentation/source-groups.js";
import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";
import type { ProgressState, QuestState } from "#lib/types/user-progress.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

/** One category row, with its original identity, presentation, & reversible store action. */
/** The progress field each row kind records its fact under. */
const FACT_FIELDS = {
  "almanac-item": "almanac",
  "animal-cosmetics": "animalCosmetics",
  "animal-variants": "animals",
  cosmetic: "cosmetics",
  "mount-appearance": "mountAppearances",
  "mount-perk": "unlockedPerks",
  "museum-item": "museum",
  "pet-cosmetic": "petCosmetics",
  "pet-skin": "petSkins",
  quest: "questStates",
  recipe: "almanacRecipes",
  spell: "spells",
} as const satisfies Partial<Record<ReportCategory, keyof ProgressState>>;

export interface SourceChecklistRow extends SourceGroupRow {
  category: CategoryKey;
  /** The row's `factKey`, which picks its checkbox's mark. */
  fact: string;
  id: string;
  name: string;
  questState?: QuestState;
  reportCategory: ReportCategory;
  searchNames?: string[];
  sprite?: string;
  subtitle?: string;
  /** Apply the category action and return its exact undo, including any recipe grants. */
  toggle: () => () => void;
}

export function buildSourceChecklist(
  ctx: ProgressContext,
  locale: LocaleCode,
): SourceChecklistRow[] {
  const rows: SourceChecklistRow[] = [];
  function add(
    category: CategoryKey,
    id: string,
    name: string,
    entity: { sources: Source[]; visibility?: VisibilityCondition },
    completed: boolean,
    reportCategory: keyof typeof FACT_FIELDS,
    toggle: () => void,
    extra: Partial<SourceChecklistRow> = {},
  ): void {
    rows.push({
      ...entity,
      category,
      completed,
      fact: factKey(FACT_FIELDS[reportCategory], id),
      id,
      key: `${category}:${reportCategory}:${id}`,
      name,
      obtainable: true,
      reportCategory,
      toggle: () => {
        toggle();
        return toggle;
      },
      ...extra,
    });
  }
  for (const row of projectAlmanac(ctx).rows) {
    add(
      "almanac",
      row.canonicalId,
      getAlmanacEntryNames(row.entry, locale)[0],
      { sources: row.sources, visibility: row.item.visibility },
      row.completed,
      "almanac-item",
      () => {
        userState.toggleAlmanacItem(row.canonicalId);
      },
      {
        obtainable: row.obtainable,
        searchNames: getAlmanacEntryNames(row.entry, locale),
        sprite: row.canonicalId,
      },
    );
  }
  for (const row of projectMuseum(ctx).rows) {
    add(
      "museum",
      row.id,
      getName("items", row.id, locale),
      trackerData.items[row.id],
      row.completed,
      "museum-item",
      () => {
        userState.toggleMuseumItem(row.id);
      },
      { obtainable: row.obtainable, sprite: row.id },
    );
  }
  const recipeSprites = new Map<RecipeId, ItemId>();
  for (const { recipes } of recipePlacements()) {
    for (const { itemId, recipeId } of recipes) {
      if (!recipeSprites.has(recipeId)) recipeSprites.set(recipeId, itemId);
    }
  }
  for (const [id, recipe] of recordEntries(trackerData.recipes)) {
    const sprite = recipeSprites.get(id);
    add(
      "recipes",
      id,
      sprite ? getName("items", sprite, locale) : getName("recipes", id, locale),
      recipe,
      ctx.progress.almanacRecipes.has(id),
      "recipe",
      () => {
        userState.toggleAlmanacRecipe(id);
      },
      { sprite },
    );
  }
  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    add(
      "cosmetics",
      id,
      getName("cosmetics", id, locale),
      cosmetic,
      ctx.progress.cosmetics.has(id),
      "cosmetic",
      () => {
        userState.toggleCosmetic(id);
      },
    );
  }
  for (const row of projectAnimals(ctx).rows) {
    switch (row.kind) {
      case "variant": {
        const animal = trackerData.animals[row.animalId];
        const species = getName("animals", animalNameId(row.animalId, "core"), locale);
        const tier = animal.variantTiers.findIndex((t) => row.variantId in t);
        const variant = animal.variantTiers[tier][row.variantId];
        add(
          "animals",
          `${row.animalId}/${row.variantId}`,
          getName("animals", animalNameId(row.animalId, "variants", row.variantId), locale),
          { sources: [variant.source], visibility: animal.visibility },
          row.completed,
          "animal-variants",
          () => {
            userState.toggleAnimalVariant(row.animalId, row.variantId);
          },
          {
            searchNames: [species],
            spoilered: isAnimalVariantSpoilered(
              row.animalId,
              row.variantId,
              ctx.progress.animals[row.animalId],
              ctx.progressionState.showSpoilers,
            ),
            subtitle: [
              species,
              animal.variantTiers.length > 1
                ? getName("ui", `tier_${tier + 1}`, locale)
                : undefined,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        );
        break;
      }
      case "cosmetic": {
        const animal = trackerData.animals[row.animalId];
        const species = getName("animals", animalNameId(row.animalId, "core"), locale);
        add(
          "animals",
          `${row.animalId}/${row.cosmeticId}`,
          getName("animals", animalNameId(row.animalId, "cosmetics", row.cosmeticId), locale),
          { ...animal.cosmetics[row.cosmeticId], visibility: animal.visibility },
          row.completed,
          "animal-cosmetics",
          () => {
            userState.toggleAnimalCosmetic(row.animalId, row.cosmeticId);
          },
          { searchNames: [species], subtitle: species },
        );
        break;
      }
      case "mountAppearance":
        add(
          "animals",
          row.id,
          getName("mount", row.id, locale),
          trackerData.mount.appearances[row.id],
          row.completed,
          "mount-appearance",
          () => {
            userState.toggleMountAppearance(row.id);
          },
        );
        break;
      case "mountPerk":
        add(
          "animals",
          row.id,
          getName("perks", row.id, locale),
          trackerData.mount.perks[row.id],
          row.completed,
          "mount-perk",
          () => {
            userState.togglePerk(row.id);
          },
        );
        break;
      case "petCosmetic":
        add(
          "animals",
          row.id,
          getName("pets/cosmetic_sets", row.id, locale),
          trackerData.pets.cosmetics[row.id],
          row.completed,
          "pet-cosmetic",
          () => {
            userState.togglePetCosmetic(row.id);
          },
        );
        break;
      case "petSkin":
        add(
          "animals",
          row.id,
          getName("pets/skins", row.id, locale),
          trackerData.pets.skins[row.id],
          row.completed,
          "pet-skin",
          () => {
            userState.togglePetSkin(row.id);
          },
        );
        break;
    }
  }
  for (const section of buildQuestSections(ctx.progress, locale)) {
    for (const row of section.rows) {
      const questId = row.kind === "craving" ? row.questId : row.id;
      if (!questId) continue;
      const visibility = row.kind === "quest" ? row.visibility : undefined;
      const categoryVisibility = trackerData.categoryVisibility[section.questType];
      const combined = visibility
        ? {
            type: "and" as const,
            conditions: [categoryVisibility, visibility] as [
              VisibilityCondition,
              VisibilityCondition,
            ],
          }
        : categoryVisibility;
      const completed = ctx.progress.questStates[questId] === "completed";
      add(
        "quests",
        row.id,
        row.displayName,
        { sources: row.kind === "quest" ? row.sources : [], visibility: combined },
        completed,
        "quest",
        () => {
          userState.completeQuestWithRecipes(questId);
        },
        {
          fact: factKey("questStates", questId),
          questState: ctx.progress.questStates[questId] ?? "none",
          subtitle: row.subtitle,
          toggle: () => {
            const completion = userState.completeQuestWithRecipes(questId);
            return () => {
              userState.undoQuestWithRecipes(questId, completion);
            };
          },
        },
      );
    }
  }
  for (const [id, spell] of recordEntries(trackerData.mines.spells)) {
    add(
      "mines",
      id,
      getName("spells", id, locale),
      spell,
      ctx.progress.spells.has(id),
      "spell",
      () => {
        userState.toggleSpell(id);
      },
    );
  }
  // Museum membership can repeat, but its donation is one completion fact.
  return [...new Map(rows.map((row) => [row.key, row])).values()];
}
