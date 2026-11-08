import * as edits from "#lib/engine/progress-edits.js";
import { editPlaytime, factKey } from "#lib/engine/provenance.js";
import { findRecipesForQuest } from "#lib/engine/quest-rewards.js";

import type { CollectionItem, QuestCompletion } from "#lib/engine/progress-edits.js";
import type { ProgressListField } from "#lib/engine/progress-fields.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  ItemId,
  MountAppearanceId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  RecipeId,
  Season,
  SkillId,
  SpellId,
  VillagerId,
  VillagerRelationship,
} from "#lib/types/tracker-data.js";
import type { ChildChoice, ProgressState, QuestState } from "#lib/types/user-progress.js";

import type { ProgressShell } from "./progress-shell.svelte.js";

interface StarterItemsNotice {
  count: number;
  dismiss: () => void;
  undo: () => void;
}

interface HandEdits {
  actions: {
    completeQuestWithRecipes: (id: QuestId) => QuestCompletion | undefined;
    markDefaultUnlocksComplete: () => void;
    recordInferred: (mutations: () => void) => void;
    setBreakUpsDisabled: (value: boolean) => void;
    setChildChoice: (choice: ChildChoice) => void;
    setHasUpperFloor: (value: boolean) => void;
    setHeartLevel: (id: VillagerId, level: number) => void;
    setMineFloor: (floor: number) => void;
    setQuestState: (id: QuestId, state: QuestState) => void;
    setReachedSeason: (season: Season) => void;
    setRenown: (level: number) => void;
    setSkillLevel: (id: SkillId, level: number) => void;
    setVillagerRelationship: (id: VillagerId, relationship: VillagerRelationship) => void;
    readonly starterItems: Readonly<StarterItemsNotice> | undefined;
    toggleAlmanacItem: (id: ItemId) => void;
    toggleAlmanacRecipe: (id: RecipeId) => void;
    toggleAnimalCosmetic: (animalId: AnimalId, cosmeticId: CosmeticId) => void;
    toggleAnimalVariant: (animalId: AnimalId, variantId: AnimalVariantId) => void;
    toggleCosmetic: (id: CosmeticId) => void;
    toggleMountAppearance: (id: MountAppearanceId) => void;
    toggleMuseumItem: (id: ItemId) => void;
    togglePerk: (id: PerkId) => void;
    togglePetCosmetic: (id: PetCosmeticSetId) => void;
    togglePetSkin: (id: PetSkinId) => void;
    toggleSpell: (id: SpellId) => void;
    undoQuestWithRecipes: (id: QuestId, completion: QuestCompletion) => void;
  };
  readonly canStartTrackingByHand: boolean;
  chooseSync: () => void;
  clearStarterItems: () => void;
  readonly laneChoiceNeeded: boolean;
  takePendingHandEdit: () => (() => void) | undefined;
}

export function createHandEdits(
  shell: Pick<ProgressShell, "facts" | "history" | "local" | "persistence" | "state">,
): HandEdits {
  let starterItems = $state.raw<StarterItemsNotice>();
  let pendingHandEdit = $state.raw<(() => void) | undefined>();
  let choosingSync = $state(false);
  let tracking = false;

  const canStartTrackingByHand = $derived(
    !shell.local.syncLane &&
      !shell.state.lastImport &&
      shell.facts.size === 0 &&
      Object.keys(shell.history.provenance).length === 0,
  );

  function takePendingHandEdit(): (() => void) | undefined {
    const pending = pendingHandEdit;
    pendingHandEdit = undefined;
    choosingSync = false;
    return pending;
  }

  function commit(next: ProgressState): void {
    // Pending writes use this object's identity to recognize edits to their current base.
    Object.assign(shell.state.progress, next);
  }

  function track<T>(run: () => T, primary?: string): T {
    if (tracking) return run();
    const before = shell.facts;
    const playtime = editPlaytime(shell.history);
    tracking = true;
    let result: T;
    try {
      result = run();
    } finally {
      tracking = false;
    }
    const { history } = shell;
    const after = shell.facts;
    for (const [key, provenance] of edits.editProvenance(
      history,
      before,
      after,
      primary,
      playtime,
    )) {
      history.provenance[key] = provenance;
      if (provenance.source === "manual" && Object.hasOwn(history.resolutions, key)) {
        const { [key]: _cleared, ...kept } = history.resolutions;
        history.resolutions = kept;
      }
    }
    return result;
  }

  function applyStarterItems(): void {
    const keys = track(() => {
      const added = edits.addStarterItems(shell.state.progress);
      commit(added.progress);
      return added.keys;
    });
    if (keys.length === 0) return;

    const batch = keys.map((key) => ({ key, provenance: shell.history.provenance[key] }));
    const notice: StarterItemsNotice = {
      count: keys.length,
      dismiss() {
        if (starterItems === notice) starterItems = undefined;
      },
      undo() {
        if (starterItems !== notice) return;
        const unchanged = batch.filter(
          ({ key, provenance }) => shell.history.provenance[key] === provenance,
        );
        track(() => {
          commit(
            edits.removeStarterItems(
              shell.state.progress,
              unchanged.map(({ key }) => key),
            ),
          );
        });
        notice.dismiss();
      },
    };
    starterItems = notice;
  }

  /** Hold the first edit until a tracking lane is chosen. Nested edits share one provenance diff. */
  function handEdit<T>(run: () => T, primary?: string, addDefaults = true): T | undefined {
    function apply(): T {
      const starting = addDefaults && !tracking && canStartTrackingByHand;
      const result = track(run, primary);
      if (starting && shell.facts.size > 0) applyStarterItems();
      return result;
    }

    if (
      !tracking &&
      shell.persistence.ready &&
      !shell.local.syncLane &&
      shell.local.trackingLane === undefined
    ) {
      choosingSync = false;
      pendingHandEdit = () => {
        apply();
      };
      return undefined;
    }
    return apply();
  }

  function manual(key: string, edit: (progress: ProgressState) => ProgressState): void {
    handEdit(() => {
      commit(edit(shell.state.progress));
    }, key);
  }

  function toggleFact<Field extends ProgressListField>(
    field: Field,
    id: CollectionItem<Field>,
  ): void {
    const items: ReadonlySet<string> = shell.state.progress[field];
    const wanted = !items.has(id);
    manual(factKey(field, id), (progress) =>
      edits.setCollectionMember(progress, field, id, wanted),
    );
  }

  return {
    actions: {
      /** Cycles the quest & its rewards, or returns undefined while waiting for a lane. */
      completeQuestWithRecipes(id: QuestId): QuestCompletion | undefined {
        return handEdit(
          () => {
            const { progress } = shell.state;
            const recipes = progress.questStates[id] === "obtained" ? findRecipesForQuest(id) : [];
            const next = edits.completeQuestWithRecipes(progress, id, recipes);
            commit(next.progress);
            return next.completion;
          },
          factKey("questStates", id),
        );
      },
      markDefaultUnlocksComplete() {
        if (canStartTrackingByHand) applyStarterItems();
      },
      /** Record the net change of a prerequisite batch as inferred. */
      recordInferred(mutations: () => void) {
        handEdit(mutations);
      },
      setBreakUpsDisabled(value: boolean) {
        manual("breakUpsDisabled", (progress) => edits.setBreakUpsDisabled(progress, value));
      },
      setChildChoice(choice: ChildChoice) {
        manual("childChoice", (progress) =>
          edits.setSimpleProgress(progress, "childChoice", choice),
        );
      },
      setHasUpperFloor(value: boolean) {
        manual("hasUpperFloor", (progress) =>
          edits.setSimpleProgress(progress, "hasUpperFloor", value),
        );
      },
      setHeartLevel(id: VillagerId, level: number) {
        manual(factKey("heartLevels", id), (progress) => edits.setHeartLevel(progress, id, level));
      },
      setMineFloor(floor: number) {
        manual("mineFloor", (progress) => edits.setMineFloor(progress, floor));
      },
      setQuestState(id: QuestId, state: QuestState) {
        manual(factKey("questStates", id), (progress) => edits.setQuestState(progress, id, state));
      },
      setReachedSeason(season: Season) {
        manual("reachedSeason", (progress) => edits.setReachedSeason(progress, season));
      },
      setRenown(level: number) {
        manual("renown", (progress) => edits.setRenown(progress, level));
      },
      setSkillLevel(id: SkillId, level: number) {
        manual(factKey("skillLevels", id), (progress) => edits.setSkillLevel(progress, id, level));
      },
      setVillagerRelationship(id: VillagerId, relationship: VillagerRelationship) {
        manual(factKey("villagerRelationships", id), (progress) =>
          edits.setVillagerRelationship(progress, id, relationship),
        );
      },
      get starterItems(): Readonly<StarterItemsNotice> | undefined {
        return starterItems;
      },
      toggleAlmanacItem(id: ItemId) {
        toggleFact("almanac", id);
      },
      toggleAlmanacRecipe(id: RecipeId) {
        toggleFact("almanacRecipes", id);
      },
      toggleAnimalCosmetic(animalId: AnimalId, cosmeticId: CosmeticId) {
        const wanted = !shell.state.progress.animalCosmetics[animalId]?.has(cosmeticId);
        manual(factKey("animalCosmetics", animalId, cosmeticId), (progress) =>
          edits.setAnimalCosmetic(progress, animalId, cosmeticId, wanted),
        );
      },
      toggleAnimalVariant(animalId: AnimalId, variantId: AnimalVariantId) {
        const wanted = !shell.state.progress.animals[animalId]?.has(variantId);
        manual(factKey("animals", animalId, variantId), (progress) =>
          edits.setAnimalVariant(progress, animalId, variantId, wanted),
        );
      },
      toggleCosmetic(id: CosmeticId) {
        toggleFact("cosmetics", id);
      },
      toggleMountAppearance(id: MountAppearanceId) {
        toggleFact("mountAppearances", id);
      },
      toggleMuseumItem(id: ItemId) {
        toggleFact("museum", id);
      },
      togglePerk(id: PerkId) {
        toggleFact("unlockedPerks", id);
      },
      togglePetCosmetic(id: PetCosmeticSetId) {
        toggleFact("petCosmetics", id);
      },
      togglePetSkin(id: PetSkinId) {
        toggleFact("petSkins", id);
      },
      toggleSpell(id: SpellId) {
        toggleFact("spells", id);
      },
      undoQuestWithRecipes(id: QuestId, completion: QuestCompletion) {
        handEdit(
          () => {
            commit(edits.undoQuestWithRecipes(shell.state.progress, id, completion));
          },
          factKey("questStates", id),
          false,
        );
      },
    },
    get canStartTrackingByHand() {
      return canStartTrackingByHand;
    },
    chooseSync() {
      choosingSync = true;
    },
    clearStarterItems() {
      starterItems = undefined;
    },
    get laneChoiceNeeded() {
      return pendingHandEdit !== undefined && !choosingSync;
    },
    takePendingHandEdit,
  };
}
