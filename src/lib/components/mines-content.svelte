<script lang="ts">
  import CompletionSection from "#lib/components/completion-section.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import MineFloorRecord from "#lib/components/mine-floor-record.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowSection from "#lib/components/tracker-row-section.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { celebrateProgress } from "#lib/controllers/celebration.js";
  import { createCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { pageShelfFacts, registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { getMaxMineFloor } from "#lib/engine/progress.js";
  import { mineFloorProgress, sealsBefore } from "#lib/engine/projections/mines.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { countShelfRows, filteredCounts, rowShelf } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SpellId } from "#lib/types/tracker-data.js";

  const sectionGrouping = createSectionGrouping<"floors" | "spells">();
  // Floor seals and spell spoilers share one dialog, which this page owns.
  const spoilerGuard = createSpoilerGuard();
  const checkOff = createCheckOff<SpellId, "floors" | "spells">({
    category: "mines",
    grouping: sectionGrouping,
    guard: spoilerGuard,
    isCompleted: (id) => userState.state.progress.spells.has(id),
    toggle: (id) => {
      userState.toggleSpell(id);
    },
  });

  function isSpellSpoilered(spellId: SpellId): boolean {
    const visibility = trackerData.mines.spells[spellId].visibility;
    return !isConditionVisible(visibility, userState.progressionState);
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
      userState.state.progress.spells.has(id as SpellId),
    );
  }

  let currentBiome = $derived.by(() => {
    const floor = userState.state.progress.mineFloor;
    let biome = trackerData.mines.biomes[0];
    for (const b of trackerData.mines.biomes) {
      if (b.floors.start <= floor) biome = b;
    }
    return biome;
  });

  function setFloorWithCelebration(floor: number): void {
    sectionGrouping.hold("floors");
    celebrateProgress(
      "mines",
      () => {
        userState.setMineFloor(floor);
      },
      [() => userState.state.progress.mineFloor >= maxFloors],
    );
  }

  function requestFloor(floor: number): void {
    const seals = sealsBefore(userState.state.progress, floor);
    if (seals) {
      spoilerGuard.requestGuardedAction(
        seals,
        () => {
          setFloorWithCelebration(floor);
        },
        { floor },
      );
    } else {
      setFloorWithCelebration(floor);
    }
  }

  let spells = $derived(
    Object.entries(trackerData.mines.spells)
      .map(([id, spell]) => ({
        id: id as SpellId,
        name: getName("spells", id as SpellId, locale),
        sources: spell.sources,
        ...pageShelfFacts(spell, userState.state.progress.spells.has(id as SpellId)),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  );

  registerSourceFilters("mines", () => trackerIndex.categorySourceTypes.mines);

  let nameFilter = $derived(toolbarState.searchQuery);

  let namedSpells = $derived(
    nameFilter
      ? spells.filter(
          ({ id, name }) => !isSpellSpoilered(id) && matchesName(name, nameFilter, locale),
        )
      : spells,
  );

  let visibleSpells = $derived(namedSpells.filter(({ shown }) => shown));

  let spellProgress = $derived(countShelfRows(spells));

  registerPageSearch(() => ({
    filtered: filteredCounts(namedSpells),
    visible: visibleSpells.length,
  }));
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#if compact && !nameFilter}
  <CompletionSection complete={userState.state.progress.mineFloor >= maxFloors}>
    <MineFloorRecord
      {biomes}
      compact
      floor={userState.state.progress.mineFloor}
      {locale}
      onChange={requestFloor}
    />
  </CompletionSection>
{/if}

<!-- The compact floor stepper sits above the sections rather than in one. -->
<SectionGroups
  forceOpen={!!nameFilter}
  getKey={(key) => key}
  grouping={sectionGrouping}
  items={compact || nameFilter ? (["spells"] as const) : (["floors", "spells"] as const)}
>
  {#snippet section(key)}
    {#if key === "floors"}
      <ExpandableSection
        {locale}
        name="Floor progress"
        progress={mineFloorProgress(userState.state.progress)}
        reportCategory="mines"
        reportEntityId="floors"
        reportExtra={{
          biome: getName("mines", currentBiome.id, locale),
          floor: userState.state.progress.mineFloor,
        }}
        {defaultOpen}
      >
        <MineFloorRecord
          {biomes}
          floor={userState.state.progress.mineFloor}
          isReportable={false}
          {locale}
          onChange={requestFloor}
        />
      </ExpandableSection>
    {:else if !nameFilter || visibleSpells.length > 0}
      <TrackerRowSection
        {locale}
        forceOpen={!!nameFilter}
        name={getName("ui", "magic_spells", locale)}
        progress={spellProgress}
        reportCategory="mines"
        reportEntityId="spells"
        {defaultOpen}
        forceShelvesOpen={!!nameFilter}
        getKey={(spell) => spell.id}
        getShelf={rowShelf}
        isLeaving={(spell) => checkOff.isLeaving(spell.id)}
        items={visibleSpells}
      >
        {#snippet row(spell)}
          <TrackerRow
            fact={factKey("spells", spell.id)}
            display={checkOff.rowDisplay(spell.id, trackerData.mines.spells[spell.id].visibility)}
            name={spell.name}
            reportCategory="spell"
            reportEntityId={spell.id}
            sources={spell.sources}
            onToggle={(covered) => {
              checkOff.onToggle(
                {
                  id: spell.id,
                  name: spell.name,
                  sectionChecks: [allSpellsComplete],
                  sectionKey: "spells",
                  visibility: trackerData.mines.spells[spell.id].visibility,
                },
                covered,
              );
            }}
          />
        {/snippet}
      </TrackerRowSection>
    {/if}
  {/snippet}
</SectionGroups>
