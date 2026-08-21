<script lang="ts">
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { PetCosmeticSetId, PetSkinId } from "$lib/types/tracker-data.js";

  let { areAllAnimalsComplete }: { areAllAnimalsComplete: () => boolean } = $props();

  let petCosmeticEntries = $derived(
    Object.entries(trackerData.pets.cosmetics)
      .map(([id, entry]) => ({ id: id as PetCosmeticSetId, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let petSkinEntries = $derived(
    Object.entries(trackerData.pets.skins)
      .map(([id, entry]) => ({ id: id as PetSkinId, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let cosmeticCompletedCount = $derived(
    petCosmeticEntries.filter((e) => userState.state.completed.petCosmetics.has(e.id)).length,
  );

  let skinCompletedCount = $derived(
    petSkinEntries.filter((e) => userState.state.completed.petSkins.has(e.id)).length,
  );

  let visibleCosmeticEntries = $derived(
    petCosmeticEntries.filter((e) => {
      const done = userState.state.completed.petCosmetics.has(e.id);
      return done ? userState.state.showCompleted : true;
    }),
  );

  let visibleSkinEntries = $derived(
    petSkinEntries.filter((e) => {
      const done = userState.state.completed.petSkins.has(e.id);
      return done ? userState.state.showCompleted : true;
    }),
  );

  function cosmeticDisplay(id: PetCosmeticSetId): TrackerRowDisplay {
    return userState.state.completed.petCosmetics.has(id)
      ? { mode: "completed" }
      : { mode: "visible" };
  }

  function skinDisplay(id: PetSkinId): TrackerRowDisplay {
    return userState.state.completed.petSkins.has(id) ? { mode: "completed" } : { mode: "visible" };
  }

  function arePetsComplete(): boolean {
    return (
      petCosmeticEntries.every((e) => userState.state.completed.petCosmetics.has(e.id)) &&
      petSkinEntries.every((e) => userState.state.completed.petSkins.has(e.id))
    );
  }
</script>

{#if visibleCosmeticEntries.length > 0}
  <ExpandableSection
    count={cosmeticCompletedCount}
    name="Pet cosmetics"
    total={petCosmeticEntries.length}
  >
    {#each visibleCosmeticEntries as entry (entry.id)}
      <TrackerRow
        display={cosmeticDisplay(entry.id)}
        name={entry.name}
        sources={entry.sources}
        onToggle={() => {
          userState.togglePetCosmetic(entry.id);
          const completed = userState.state.completed.petCosmetics.has(entry.id);
          showUndoToast(entry.name, completed, () => {
            userState.togglePetCosmetic(entry.id);
          });
          if (completed && arePetsComplete() && areAllAnimalsComplete()) {
            celebrateCategory();
          } else if (completed && arePetsComplete()) {
            celebrate();
          }
        }}
      />
    {/each}
  </ExpandableSection>
{/if}

{#if visibleSkinEntries.length > 0}
  <ExpandableSection count={skinCompletedCount} name="Pet skins" total={petSkinEntries.length}>
    {#each visibleSkinEntries as entry (entry.id)}
      <TrackerRow
        display={skinDisplay(entry.id)}
        name={entry.name}
        sources={entry.sources}
        onToggle={() => {
          userState.togglePetSkin(entry.id);
          const completed = userState.state.completed.petSkins.has(entry.id);
          showUndoToast(entry.name, completed, () => {
            userState.togglePetSkin(entry.id);
          });
          if (completed && arePetsComplete() && areAllAnimalsComplete()) {
            celebrateCategory();
          } else if (completed && arePetsComplete()) {
            celebrate();
          }
        }}
      />
    {/each}
  </ExpandableSection>
{/if}
