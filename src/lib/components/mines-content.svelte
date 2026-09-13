<script lang="ts">
  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import MineFloorRecord from "$lib/components/mine-floor-record.svelte";
  import TrackerRowStack from "$lib/components/tracker-row-stack.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData, trackerIndex } from "$lib/data/index.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { SpellId } from "$lib/types/tracker-data.js";

  const spoilerGuard = createSpoilerGuard();

  function spellNameVisible(spellId: SpellId): boolean {
    const visibility = trackerData.mines.spells[spellId].visibility;
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  function rowDisplay(spellId: SpellId, completed: boolean): TrackerRowDisplay {
    if (!spellNameVisible(spellId)) return { mode: "spoilered" };
    return completed ? { mode: "completed" } : { mode: "visible" };
  }

  function toggleSpell(spellId: SpellId): void {
    userState.toggleSpell(spellId);
    const completed = userState.state.completed.mines.spells.has(spellId);
    const spell = trackerData.mines.spells[spellId];
    showUndoToast(spell.name, completed, () => {
      userState.toggleSpell(spellId);
    });
    if (completed) {
      if (isMinesComplete()) {
        celebrateCategory();
      } else if (allSpellsComplete()) {
        celebrate();
      }
    }
  }

  const { compact = false, defaultOpen = false }: { compact?: boolean; defaultOpen?: boolean } =
    $props();

  const biomes = trackerData.mines.biomes;
  const maxFloors = biomes[biomes.length - 1].floors.end;

  function isMinesComplete(): boolean {
    const allSpells = Object.keys(trackerData.mines.spells).every((id) =>
      userState.state.completed.mines.spells.has(id as SpellId),
    );
    return allSpells && userState.state.completed.mines.floor >= maxFloors;
  }

  function allSpellsComplete(): boolean {
    return Object.keys(trackerData.mines.spells).every((id) =>
      userState.state.completed.mines.spells.has(id as SpellId),
    );
  }

  let currentBiome = $derived.by(() => {
    const floor = userState.state.completed.mines.floor;
    let biome = trackerData.mines.biomes[0];
    for (const b of trackerData.mines.biomes) {
      if (b.floors.start <= floor) biome = b;
    }
    return biome;
  });

  function setFloorWithCelebration(floor: number): void {
    const wasMinesComplete = isMinesComplete();
    const previousFloor = userState.state.completed.mines.floor;
    userState.setMineFloor(floor);
    if (!wasMinesComplete && isMinesComplete()) {
      celebrateCategory();
    } else if (previousFloor < maxFloors && userState.state.completed.mines.floor >= maxFloors) {
      celebrate();
    }
  }

  let spells = $derived(
    Object.entries(trackerData.mines.spells)
      .map(([id, spell]) => ({ id: id as SpellId, name: spell.name, sources: spell.sources }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  registerSourceFilters("mines", () => trackerIndex.categorySourceTypes.mines);

  let scopedSpells = $derived(
    spells.filter(({ sources }) => toolbarState.matchesSourceFilters(sources)),
  );

  let visibleSpells = $derived(
    scopedSpells.filter((spell) => {
      const completed = userState.state.completed.mines.spells.has(spell.id);
      return completed ? userState.state.showCompleted : true;
    }),
  );
</script>

{#if spoilerGuard.condition}
  <ConfirmSpoilerDialog
    condition={spoilerGuard.condition}
    bind:open={spoilerGuard.open}
    onCancel={() => {
      spoilerGuard.cancel();
    }}
    onComplete={() => {
      spoilerGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      spoilerGuard.completeAndUpdate();
    }}
  />
{/if}

{#if compact}
  <MineFloorRecord
    {biomes}
    compact
    floor={userState.state.completed.mines.floor}
    onChange={setFloorWithCelebration}
  />
{:else}
  <ExpandableSection
    count={userState.state.completed.mines.floor}
    name="Floor Progress"
    reportCategory="mines"
    reportEntityId="floors"
    reportExtra={{ biome: currentBiome.name, floor: userState.state.completed.mines.floor }}
    {defaultOpen}
    total={maxFloors}
  >
    <MineFloorRecord
      {biomes}
      floor={userState.state.completed.mines.floor}
      onChange={setFloorWithCelebration}
      registerFeedback={false}
    />
  </ExpandableSection>
{/if}

{#if scopedSpells.length > 0}
  <ExpandableSection
    count={scopedSpells.filter((spell) => userState.state.completed.mines.spells.has(spell.id))
      .length}
    name="Spells"
    reportCategory="mines"
    reportEntityId="spells"
    {defaultOpen}
    total={scopedSpells.length}
  >
    <TrackerRowStack>
      {#each visibleSpells as spell (spell.id)}
        {@const completed = userState.state.completed.mines.spells.has(spell.id)}
        <TrackerRow
          display={rowDisplay(spell.id, completed)}
          name={spell.name}
          reportCategory="spell"
          reportEntityId={spell.id}
          sources={spell.sources}
          onToggle={() => {
            if (spellNameVisible(spell.id) || completed) {
              toggleSpell(spell.id);
            } else {
              spoilerGuard.guard(trackerData.mines.spells[spell.id].visibility, () => {
                toggleSpell(spell.id);
              });
            }
          }}
        />
      {/each}
    </TrackerRowStack>
    {#if visibleSpells.length === 0}
      <p class="py-4 text-center text-sm text-muted-foreground">
        No items match the current filters
      </p>
    {/if}
  </ExpandableSection>
{:else if toolbarState.sourceFilterActive}
  <p class="py-4 text-center text-sm text-muted-foreground">No items match the current filters</p>
{/if}
