<script lang="ts">
  import ConfirmRedactedDialog from "$lib/components/confirm-redacted-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import Stepper from "$lib/components/stepper.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { createRedactionGuard } from "$lib/utils/redaction-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { SpellId } from "$lib/types/tracker-data.js";

  const redactGuard = createRedactionGuard();

  function spellNameVisible(spellId: SpellId): boolean {
    const visibility = trackerData.mines.spells[spellId].visibility ?? { type: "always" };
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  function rowDisplay(spellId: SpellId, completed: boolean): TrackerRowDisplay {
    if (!spellNameVisible(spellId)) return { mode: "redacted" };
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

  function isMinesComplete(): boolean {
    const allSpells = Object.keys(trackerData.mines.spells).every((id) =>
      userState.state.completed.mines.spells.has(id as SpellId),
    );
    return allSpells && userState.state.completed.mines.floor >= trackerData.mines.maxFloors;
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
      if (b.startFloor <= floor) biome = b;
    }
    return biome;
  });

  let spells = $derived(
    Object.entries(trackerData.mines.spells)
      .map(([id, spell]) => ({ id: id as SpellId, name: spell.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let visibleSpells = $derived(
    spells.filter((spell) => {
      const completed = userState.state.completed.mines.spells.has(spell.id);
      return completed ? userState.state.showCompleted : true;
    }),
  );
</script>

{#if redactGuard.condition}
  <ConfirmRedactedDialog
    condition={redactGuard.condition}
    bind:open={redactGuard.open}
    onCancel={() => {
      redactGuard.cancel();
    }}
    onComplete={() => {
      redactGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      redactGuard.completeAndUpdate();
    }}
  />
{/if}

{#if compact}
  <div class="flex items-center gap-2 rounded-md px-2">
    <span class="min-w-0 flex-1 text-base font-medium">Floor Progress</span>
    <div class="w-32 shrink-0">
      <Stepper
        size="sm"
        decrementDisabled={userState.state.completed.mines.floor <= 0}
        incrementDisabled={userState.state.completed.mines.floor >= trackerData.mines.maxFloors}
        decrementLabel="Go up one floor"
        incrementLabel="Go down one floor"
        onDecrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor - 1);
        }}
        onIncrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor + 1);
          if (isMinesComplete()) {
            celebrateCategory();
          } else if (userState.state.completed.mines.floor >= trackerData.mines.maxFloors) {
            celebrate();
          }
        }}
      >
        <span class="text-sm text-muted-foreground tabular-nums">
          {userState.state.completed.mines.floor}/{trackerData.mines.maxFloors}
        </span>
      </Stepper>
    </div>
  </div>
{:else}
  <ExpandableSection
    count={userState.state.completed.mines.floor}
    name="Floor Progress"
    {defaultOpen}
    total={trackerData.mines.maxFloors}
  >
    <div class="flex flex-col gap-2 py-2">
      <Stepper
        decrementDisabled={userState.state.completed.mines.floor <= 0}
        incrementDisabled={userState.state.completed.mines.floor >= trackerData.mines.maxFloors}
        decrementLabel="Go up one floor"
        incrementLabel="Go down one floor"
        onDecrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor - 1);
        }}
        onIncrement={() => {
          userState.setMineFloor(userState.state.completed.mines.floor + 1);
          if (isMinesComplete()) {
            celebrateCategory();
          } else if (userState.state.completed.mines.floor >= trackerData.mines.maxFloors) {
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
            max={trackerData.mines.maxFloors}
            value={userState.state.completed.mines.floor}
            onchange={(e) => {
              const v = Math.max(
                0,
                Math.min(trackerData.mines.maxFloors, Number(e.currentTarget.value)),
              );
              userState.setMineFloor(v);
              if (isMinesComplete()) {
                celebrateCategory();
              } else if (v >= trackerData.mines.maxFloors) {
                celebrate();
              }
            }}
            class="w-14 [appearance:textfield] bg-transparent text-center text-xl font-semibold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </span>
      </Stepper>
      <span class="text-sm text-muted-foreground">
        {currentBiome().name}
        (floors {currentBiome().startFloor}–{currentBiome().endFloor})
      </span>
    </div>
  </ExpandableSection>
{/if}

{#if visibleSpells.length > 0}
  <ExpandableSection
    count={spells.filter((s) => userState.state.completed.mines.spells.has(s.id)).length}
    name="Spells"
    {defaultOpen}
    total={spells.length}
  >
    {#each visibleSpells as spell (spell.id)}
      {@const completed = userState.state.completed.mines.spells.has(spell.id)}
      <TrackerRow
        display={rowDisplay(spell.id, completed)}
        name={spell.name}
        onToggle={() => {
          if (spellNameVisible(spell.id) || completed) {
            toggleSpell(spell.id);
          } else {
            redactGuard.guard(
              trackerData.mines.spells[spell.id].visibility ?? { type: "always" },
              () => {
                toggleSpell(spell.id);
              },
            );
          }
        }}
      />
    {/each}
  </ExpandableSection>
{/if}
