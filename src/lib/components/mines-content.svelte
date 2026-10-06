<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import MineFloorRecord from "#lib/components/mine-floor-record.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { getMaxMineFloor, isCategoryComplete } from "#lib/engine/progress.js";
  import { isEntityNameVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SpellId } from "#lib/types/tracker-data.js";

  const spoilerGuard = createSpoilerGuard();

  function spellNameVisible(spellId: SpellId): boolean {
    const visibility = trackerData.mines.spells[spellId].visibility;
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  function toggleSpell(spellId: SpellId): void {
    userState.toggleSpell(spellId);
    const completed = userState.state.completed.mines.spells.has(spellId);
    showUndoToast(getName("spells", spellId, locale), completed, () => {
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

  let {
    compact = false,
    defaultOpen = false,
    locale,
  }: {
    compact?: boolean;
    defaultOpen?: boolean;
    locale: LocaleCode;
  } = $props();

  const biomes = trackerData.mines.biomes;
  const maxFloors = getMaxMineFloor();

  function allSpellsComplete(): boolean {
    return Object.keys(trackerData.mines.spells).every((id) =>
      userState.state.completed.mines.spells.has(id as SpellId),
    );
  }

  function isMinesComplete(): boolean {
    return isCategoryComplete("mines", userState.state);
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
      .map(([id, spell]) => ({
        id: id as SpellId,
        name: getName("spells", id as SpellId, locale),
        sources: spell.sources,
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
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

<SpoilerGuardDialog guard={spoilerGuard} />

{#if compact}
  <MineFloorRecord
    {biomes}
    compact
    floor={userState.state.completed.mines.floor}
    {locale}
    onChange={setFloorWithCelebration}
  />
{:else}
  <ExpandableSection
    {locale}
    count={userState.state.completed.mines.floor}
    name={m.mines_floor_progress_section()}
    reportCategory="mines"
    reportEntityId="floors"
    reportExtra={{
      biome: getName("mines", currentBiome.id, locale),
      floor: userState.state.completed.mines.floor,
    }}
    {defaultOpen}
    total={maxFloors}
  >
    <MineFloorRecord
      {biomes}
      floor={userState.state.completed.mines.floor}
      isReportable={false}
      {locale}
      onChange={setFloorWithCelebration}
    />
  </ExpandableSection>
{/if}

{#if scopedSpells.length > 0}
  <ExpandableSection
    {locale}
    count={scopedSpells.filter((spell) => userState.state.completed.mines.spells.has(spell.id))
      .length}
    name={getName("ui", "magic_spells", locale)}
    reportCategory="mines"
    reportEntityId="spells"
    {defaultOpen}
    total={scopedSpells.length}
  >
    <TrackerRowList getKey={(spell) => spell.id} items={visibleSpells}>
      {#snippet row(spell)}
        {@const completed = userState.state.completed.mines.spells.has(spell.id)}
        <TrackerRow
          display={trackerRowDisplay({ completed, nameVisible: spellNameVisible(spell.id) })}
          name={spell.name}
          reportCategory="spell"
          reportEntityId={spell.id}
          sources={spell.sources}
          onToggle={() => {
            if (spellNameVisible(spell.id) || completed) {
              toggleSpell(spell.id);
            } else {
              spoilerGuard.requestGuardedAction(
                trackerData.mines.spells[spell.id].visibility,
                () => {
                  toggleSpell(spell.id);
                },
              );
            }
          }}
        />
      {/snippet}
    </TrackerRowList>
  </ExpandableSection>
{:else if toolbarState.isSourceFilterNarrowing}
  <TrackerEmptyState />
{/if}
