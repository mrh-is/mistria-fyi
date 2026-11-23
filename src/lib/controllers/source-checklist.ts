import { trackerData } from "#lib/data/index.js";
import { getAlmanacEntryVariant } from "#lib/data/item-variants.js";
import { animalNameId, getAlmanacEntryNames, getName } from "#lib/data/names.js";
import { isAnimalVariantSpoilered } from "#lib/engine/animal-availability.js";
import { PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
import { projectAlmanac } from "#lib/engine/projections/almanac.js";
import { projectAnimals } from "#lib/engine/projections/animals.js";
import { projectMuseum } from "#lib/engine/projections/museum.js";
import { projectQuests, questSources } from "#lib/engine/projections/quests.js";
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
import type { ItemId, QuestId, QuestType, RecipeId, VillagerId } from "#lib/types/tracker-data.js";
import type { ProgressState, QuestState } from "#lib/types/user-progress.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

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

/** One category row, with its original identity, presentation, & reversible store action. */
export interface SourceChecklistRow extends SourceGroupRow {
  category: CategoryKey;
  disabled?: boolean;
  /** The row's `factKey`, which picks its checkbox's mark. */
  fact: string;
  id: string;
  name: string;
  questState?: QuestState;
  questType?: QuestType;
  /** The quest’s own gate, without the gate on its section. */
  questVisibility?: VisibilityCondition;
  reportCategory: ReportCategory;
  searchNames?: string[];
  /** Secondary words matched with the names, such as an almanac variant (“white window”). */
  searchTerms?: string[];
  sprite?: string;
  subtitle?: string;
  /** Apply the category action and return its exact undo, including any recipe grants. */
  toggle: () => () => void;
}

type RowDescription = Pick<SourceChecklistRow, "name" | "searchNames" | "searchTerms" | "subtitle">;
type SourceChecklistDraft = Omit<SourceChecklistRow, keyof RowDescription> & {
  describe?: (locale: LocaleCode) => RowDescription;
};

export function buildSourceChecklist(
  ctx: ProgressContext,
  locale: LocaleCode,
  /** Decides each row's spoiler mask. Availability never reads it. */
  showSpoilers = false,
  category?: CategoryKey,
): SourceChecklistRow[] {
  return collectSourceRows(
    ctx,
    showSpoilers,
    !category || category === "quests" ? locale : undefined,
    category === "quests",
  )
    .filter((row) => category === undefined || row.category === category)
    .map(({ describe, ...row }) => {
      if (!describe) throw new Error(`No checklist description for ${row.key}`);
      return { ...row, ...describe(locale) };
    });
}

/** Home needs the same facts & placements without loading item names or acquisition messages. */
export function projectSourceChecklist(ctx: ProgressContext): SourceGroupRow[] {
  return collectSourceRows(ctx, false);
}

function collectSourceRows(
  ctx: ProgressContext,
  showSpoilers: boolean,
  questLocale?: LocaleCode,
  questCategory = false,
): SourceChecklistDraft[] {
  const rows: SourceChecklistDraft[] = [];
  function add(
    category: CategoryKey,
    id: string,
    describe: SourceChecklistDraft["describe"],
    entity: { sources: Source[]; visibility?: VisibilityCondition },
    completed: boolean,
    reportCategory: keyof typeof FACT_FIELDS,
    toggle: () => void,
    extra: Partial<SourceChecklistDraft> = {},
  ): void {
    rows.push({
      ...entity,
      category,
      completed,
      describe,
      fact: factKey(FACT_FIELDS[reportCategory], id),
      id,
      key: `${category}:${reportCategory}:${id}`,
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
      (locale) => {
        const searchNames = getAlmanacEntryNames(row.entry, locale);
        const variant = getAlmanacEntryVariant(row.entry, locale);
        return {
          name: searchNames[0],
          searchNames,
          ...(variant ? { searchTerms: [variant], subtitle: variant } : {}),
        };
      },
      { sources: row.sources, visibility: row.item.visibility },
      row.completed,
      "almanac-item",
      () => {
        userState.toggleAlmanacItem(row.canonicalId);
      },
      {
        obtainable: row.obtainable,
        sprite: row.canonicalId,
      },
    );
  }
  for (const row of projectMuseum(ctx).rows) {
    add(
      "museum",
      row.id,
      (locale) => ({ name: getName("items", row.id, locale) }),
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
      (locale) => ({
        name: sprite ? getName("items", sprite, locale) : getName("recipes", id, locale),
      }),
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
      (locale) => ({ name: getName("cosmetics", id, locale) }),
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
        const tier = animal.variantTiers.findIndex((t) => row.variantId in t);
        const variant = animal.variantTiers[tier][row.variantId];
        add(
          "animals",
          `${row.animalId}/${row.variantId}`,
          (locale) => {
            const species = getName("animals", animalNameId(row.animalId, "core"), locale);
            return {
              name: getName(
                "animals",
                animalNameId(row.animalId, "variants", row.variantId),
                locale,
              ),
              searchNames: [species],
              subtitle:
                animal.variantTiers.length > 1
                  ? [species, getName("ui", `tier_${tier + 1}`, locale)].join(" · ")
                  : species,
            };
          },
          { sources: [variant.source], visibility: animal.visibility },
          row.completed,
          "animal-variants",
          () => {
            userState.toggleAnimalVariant(row.animalId, row.variantId);
          },
          {
            locked: isAnimalVariantSpoilered(
              row.animalId,
              row.variantId,
              ctx.progress.animals[row.animalId],
              false,
            ),
            spoilered: isAnimalVariantSpoilered(
              row.animalId,
              row.variantId,
              ctx.progress.animals[row.animalId],
              showSpoilers,
            ),
          },
        );
        break;
      }
      case "cosmetic": {
        const animal = trackerData.animals[row.animalId];
        add(
          "animals",
          `${row.animalId}/${row.cosmeticId}`,
          (locale) => {
            const species = getName("animals", animalNameId(row.animalId, "core"), locale);
            return {
              name: getName(
                "animals",
                animalNameId(row.animalId, "cosmetics", row.cosmeticId),
                locale,
              ),
              searchNames: [species],
              subtitle: species,
            };
          },
          { ...animal.cosmetics[row.cosmeticId], visibility: animal.visibility },
          row.completed,
          "animal-cosmetics",
          () => {
            userState.toggleAnimalCosmetic(row.animalId, row.cosmeticId);
          },
        );
        break;
      }
      case "mountAppearance":
        add(
          "animals",
          row.id,
          (locale) => ({ name: getName("mount", row.id, locale) }),
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
          (locale) => ({ name: getName("perks", row.id, locale) }),
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
          (locale) => ({ name: getName("pets/cosmetic_sets", row.id, locale) }),
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
          (locale) => ({ name: getName("pets/skins", row.id, locale) }),
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
  const quests = projectQuests(ctx);
  const questAvailability = new Map(quests.rows.map((row) => [row.id, row.doableAnywhere]));
  function addQuest(
    questId: QuestId,
    questType: QuestType,
    sources: Source[],
    visibility?: VisibilityCondition,
    description?: RowDescription,
  ): void {
    const categoryVisibility = trackerData.categoryVisibility[questType];
    const combined: undefined | VisibilityCondition =
      categoryVisibility && visibility
        ? { type: "and", conditions: [categoryVisibility, visibility] }
        : (visibility ?? categoryVisibility);
    const questState = ctx.progress.questStates[questId] ?? "none";
    const completed = questState === "completed";
    const quest = trackerData.quests[questType][questId];
    const giver: null | VillagerId = "villager" in quest ? quest.villager : null;
    add(
      "quests",
      questId,
      description ? () => description : undefined,
      { sources: questCategory ? sources : quest.sources, visibility: combined },
      completed,
      "quest",
      () => {
        userState.completeQuestWithRecipes(questId);
      },
      {
        fact: factKey("questStates", questId),
        locked: !completed && questAvailability.get(questId) === false,
        questGiver: questCategory ? undefined : giver,
        questState,
        questType,
        questVisibility: visibility,
        toggle: () => {
          const completion = userState.completeQuestWithRecipes(questId);
          return () => {
            if (completion) userState.undoQuestWithRecipes(questId, completion);
          };
        },
      },
    );
  }
  if (questLocale) {
    for (const { questType, rows: questRows } of buildQuestSections(ctx.progress, questLocale)) {
      for (const row of questRows) {
        const description = { name: row.displayName, subtitle: row.subtitle };
        if (row.kind === "quest") {
          addQuest(row.id, questType, row.sources, row.visibility, description);
        } else if (row.questId) {
          addQuest(row.questId, questType, [], undefined, description);
        } else if (questCategory) {
          add(
            "quests",
            row.id,
            () => description,
            { sources: [] },
            false,
            "quest",
            () => undefined,
            {
              disabled: true,
              locked: true,
              questType,
              reportCategory: "craving-quest",
              spoilered: true,
            },
          );
        }
      }
    }
  } else {
    for (const [questType, byType] of recordEntries(trackerData.quests)) {
      for (const [id, quest] of recordEntries(byType)) {
        if (!PREGNANCY_QUEST_IDS.has(id)) {
          addQuest(id, questType, questSources(questType, id), quest.visibility);
        }
      }
    }
    if (quests.craving.applicable && quests.craving.questId) {
      addQuest(quests.craving.questId, "heart", []);
    }
  }
  for (const [id, spell] of recordEntries(trackerData.mines.spells)) {
    add(
      "mines",
      id,
      (locale) => ({ name: getName("spells", id, locale) }),
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
