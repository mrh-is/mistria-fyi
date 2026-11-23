<script lang="ts">
  import CompletionSection from "#lib/components/completion-section.svelte";
  import MineDepthChart from "#lib/components/mine-depth-chart.svelte";
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
  import { categoryNameForKey } from "#lib/data/categories.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { captureVerticalMeterUndo } from "#lib/effects/undo-toast.js";
  import { getMaxMineFloor } from "#lib/engine/progress.js";
  import { sealsBefore } from "#lib/engine/projections/mines.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { countShelfRows, filteredCounts, rowShelf } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { matchesName } from "#lib/utils/name-match.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SpellId } from "#lib/types/tracker-data.js";

  const sectionGrouping = createSectionGrouping<"spells">();
  // Floor seals and spell spoilers share one dialog, which this page owns.
  const spoilerGuard = createSpoilerGuard();
  const checkOff = createCheckOff<SpellId, "spells">({
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

  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  const biomes = trackerData.mines.biomes;
  const maxFloors = getMaxMineFloor();

  function allSpellsComplete(): boolean {
    return Object.keys(trackerData.mines.spells).every((id) =>
      userState.state.progress.spells.has(id as SpellId),
    );
  }

  function requestFloor(floor: number): void {
    const onApplied = compact
      ? undefined
      : captureVerticalMeterUndo("mineFloor", categoryNameForKey("mines", locale), locale);
    const seals = sealsBefore(userState.state.progress, floor);
    const apply = () => {
      celebrateProgress(
        "mines",
        () => {
          userState.setMineFloor(floor, onApplied);
        },
        [() => userState.state.progress.mineFloor >= maxFloors],
      );
    };
    if (seals) {
      spoilerGuard.requestGuardedAction(seals, apply, { floor });
    } else {
      apply();
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
          ({ completed, id, name }) =>
            (completed || !isSpellSpoilered(id)) && matchesName(name, nameFilter, locale),
        )
      : spells,
  );

  let visibleSpells = $derived(namedSpells.filter(({ shown }) => shown));
  let floorReadout = $derived(formatNumber(maxFloors, locale));
  let spellReadout = $derived(formatNumber(spells.length, locale));

  let spellProgress = $derived(countShelfRows(spells));
  let learnedReadout = $derived(formatNumber(spellProgress.completed, locale));

  registerPageSearch(() => ({
    filtered: filteredCounts(namedSpells),
    visible: visibleSpells.length,
  }));
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#snippet spellRow(spell: (typeof spells)[number])}
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

{#if !compact}
  <div class="mines-layout" data-ledger-layout>
    <MineDepthChart
      floor={userState.state.progress.mineFloor}
      {locale}
      max={maxFloors}
      onChange={requestFloor}
    />
    {#if !nameFilter || visibleSpells.length > 0}
      <section class="spells">
        <h2>
          {getName("ui", "magic_spells", locale)}
          <span>{learnedReadout} / {spellReadout}</span>
        </h2>
        <ul data-tracker-list>
          {#each visibleSpells as spell (spell.id)}
            <li>
              {#if spell.completed || !isSpellSpoilered(spell.id)}
                {@render spellRow(spell)}
              {:else}
                <span class="unfound">
                  <span class="empty-box" aria-hidden="true"></span>
                  <span class="blank" aria-hidden="true"></span>
                  <span>A spell you haven’t found</span>
                </span>
              {/if}
            </li>
          {/each}
        </ul>
        {#if !nameFilter}
          <p>
            {`The mines are ${floorReadout} floors with ${spellReadout} spells. Biomes below your deepest floor stay unnamed, and a spell’s name shows once you can learn it.`}
          </p>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  {#if !nameFilter}
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
    items={["spells"] as const}
  >
    {#snippet section()}
      {#if !nameFilter || visibleSpells.length > 0}
        <TrackerRowSection
          {locale}
          forceOpen={!!nameFilter}
          name={getName("ui", "magic_spells", locale)}
          progress={spellProgress}
          reportCategory="mines"
          reportEntityId="spells"
          forceShelvesOpen={!!nameFilter}
          getKey={(spell) => spell.id}
          getShelf={rowShelf}
          isLeaving={(spell) => checkOff.isLeaving(spell.id)}
          items={visibleSpells}
        >
          {#snippet row(spell)}
            {@render spellRow(spell)}
          {/snippet}
        </TrackerRowSection>
      {/if}
    {/snippet}
  </SectionGroups>
{/if}

<style>
  .mines-layout {
    display: grid;
    align-items: start;
    gap: 1.25rem;
  }

  .spells {
    min-inline-size: 0;
  }

  .spells h2 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    margin-block-end: 0.5rem;
    font-size: var(--text-xl);
  }

  .spells h2 span {
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .spells ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .spells p,
  .unfound {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
  }

  .spells p {
    margin-block-start: 0.75rem;
  }

  .unfound {
    display: flex;
    min-block-size: 44px;
    align-items: center;
    gap: 0.5rem;
    border-block-end: 1px solid var(--color-rule);
  }

  .empty-box {
    flex: none;
    inline-size: 1rem;
    block-size: 1rem;
    border: 1px solid var(--color-ink-hairline);
  }

  .blank {
    flex: 0 1 4rem;
    min-block-size: 1em;
    border-block-end: 1px solid var(--color-ink-muted);
  }

  @media (min-width: 60rem) {
    .mines-layout {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }
  }
</style>
