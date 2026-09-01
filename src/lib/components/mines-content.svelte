<script lang="ts">
  import { page } from "$app/state";
  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import Stepper from "$lib/components/stepper.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { SpellId } from "$lib/types/tracker-data.js";

  const feedbackContext = getFeedbackContextOrFallback();
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

  let currentBiome = $derived(() => {
    const floor = userState.state.completed.mines.floor;
    let biome = trackerData.mines.biomes[0];
    for (const b of trackerData.mines.biomes) {
      if (b.floors.start <= floor) biome = b;
    }
    return biome;
  });

  let floorReportable = $derived(
    feedbackContext.reportable({
      category: "mines",
      displayName: "Floor Progress",
      extra: { biome: currentBiome().name, floor: userState.state.completed.mines.floor },
      page: page.url.pathname,
    }),
  );

  let spells = $derived(
    Object.entries(trackerData.mines.spells)
      .map(([id, spell]) => ({ id: id as SpellId, name: spell.name, sources: spell.sources }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  registerSourceFilters("mines", () => spells.flatMap(({ sources }) => sources));

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
  <div class="flex items-center gap-2 rounded-md px-2" {@attach floorReportable}>
    <span class="min-w-0 flex-1 text-base font-medium">Floor Progress</span>
    <div class="w-32 shrink-0">
      <Stepper
        decrementDisabled={userState.state.completed.mines.floor <= 0}
        incrementDisabled={userState.state.completed.mines.floor >= maxFloors}
        decrementLabel="Go up one floor"
        incrementLabel="Go down one floor"
        onDecrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor - 1);
        }}
        onIncrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor + 1);
          if (isMinesComplete()) {
            celebrateCategory();
          } else if (userState.state.completed.mines.floor >= maxFloors) {
            celebrate();
          }
        }}
      >
        <span class="text-sm text-muted-foreground tabular-nums">
          {userState.state.completed.mines.floor}/{maxFloors}
        </span>
      </Stepper>
    </div>
  </div>
{:else}
  <ExpandableSection
    count={userState.state.completed.mines.floor}
    name="Floor Progress"
    reportCategory="mines"
    reportEntityId="floors"
    reportExtra={{ biome: currentBiome().name, floor: userState.state.completed.mines.floor }}
    {defaultOpen}
    total={maxFloors}
  >
    <div class="flex flex-col gap-2 py-2">
      <Stepper
        decrementDisabled={userState.state.completed.mines.floor <= 0}
        incrementDisabled={userState.state.completed.mines.floor >= maxFloors}
        decrementLabel="Go up one floor"
        incrementLabel="Go down one floor"
        onDecrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor - 1);
        }}
        onIncrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor + 1);
          if (isMinesComplete()) {
            celebrateCategory();
          } else if (userState.state.completed.mines.floor >= maxFloors) {
            celebrate();
          }
        }}
      >
        <span class="inline-flex w-full items-center justify-center gap-1 text-xl font-semibold">
          Floor
          <input
            type="number"
            inputmode="numeric"
            min="0"
            max={maxFloors}
            value={userState.state.completed.mines.floor}
            onchange={(e) => {
              const v = Math.max(0, Math.min(maxFloors, Number(e.currentTarget.value)));
              userState.setMineFloor(v);
              if (isMinesComplete()) {
                celebrateCategory();
              } else if (v >= maxFloors) {
                celebrate();
              }
            }}
            class="w-14 [appearance:textfield] bg-transparent text-center text-xl font-semibold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </span>
      </Stepper>
      <span class="text-sm text-muted-foreground">
        {currentBiome().name}
        (floors {currentBiome().floors.start}–{currentBiome().floors.end})
      </span>
    </div>
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
    {#if visibleSpells.length === 0}
      <p class="py-4 text-center text-sm text-muted-foreground">
        No items match the current filters
      </p>
    {/if}
  </ExpandableSection>
{:else if toolbarState.sourceFilterActive}
  <p class="py-4 text-center text-sm text-muted-foreground">No items match the current filters</p>
{/if}
