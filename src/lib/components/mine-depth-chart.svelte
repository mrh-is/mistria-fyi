<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import { meterInput } from "#lib/attachments/meter-input.js";
  import MineBiomeContents from "#lib/components/mine-biome-contents.svelte";
  import Stepper from "#lib/components/stepper.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { filteredCounts, shelfFacts } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { isBiomeSource } from "#lib/presentation/mine-biome-sources.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AlmanacCategoryId, MinesBiomeId } from "#lib/types/tracker-data.js";

  let {
    floor,
    locale,
    max,
    onChange,
  }: {
    floor: number;
    locale: LocaleCode;
    max: number;
    onChange: (floor: number) => void;
  } = $props();

  const feedback = getFeedbackContext();
  const biomes = trackerData.mines.biomes;
  const expandedBiomes = new SvelteSet<MinesBiomeId>();
  const furniture = new Set<string>(
    trackerData.almanac["furniture" as AlmanacCategoryId].items.map(({ itemIds }) => itemIds[0]),
  );
  const dishes = new Set<string>(
    trackerData.almanac["cooked_dishes" as AlmanacCategoryId].items.map(
      ({ itemIds }) => itemIds[0],
    ),
  );
  let rungs = $derived(
    Array.from({ length: Math.floor(max / 20) }, (_, index) => (index + 1) * 20),
  );
  let preview = $state<number>();
  let shown = $derived(preview ?? floor);
  let printed = $derived(formatNumber(shown, locale));
  let total = $derived(formatNumber(max, locale));
  let search = $derived(toolbarState.searchQuery);
  let reportable = $derived(
    feedback.reportableAttachment({
      category: "mines",
      displayName: "Floor progress",
      extra: { floor },
      page: page.url.pathname,
    }),
  );
  let input = $derived(
    meterInput({
      getValue: () => floor,
      majorStep: 10,
      max,
      min: 0,
      onCommit: onChange,
      onPreview: (value) => {
        preview = value;
      },
      orientation: "vertical",
      reverse: true,
    }),
  );
  let rows = $derived(
    buildSourceChecklist(
      userState.progressContext,
      locale,
      userState.state.showSpoilers,
      undefined,
      ({ id, obtainable, reportCategory, sources }) =>
        obtainable &&
        (reportCategory === "recipe" ||
          reportCategory === "pet-skin" ||
          (reportCategory === "almanac-item" && (furniture.has(id) || dishes.has(id)))) &&
        sources.some((source) => biomes.some((biome) => isBiomeSource(source, biome))),
    ),
  );

  let sections = $derived(
    biomes.map((biome) => {
      const reached = biome.floors.start <= floor;
      const name = reached ? getName("mines", biome.id, locale) : undefined;
      const entries = reached
        ? rows.filter((row) => row.sources.some((source) => isBiomeSource(source, biome)))
        : [];
      const nameMatch = Boolean(search && name && matchesName(name, search, locale));
      const named = entries.filter(
        (row) =>
          !search ||
          nameMatch ||
          ((userState.state.showSpoilers ||
            isConditionVisible(row.visibility, userState.progressionState)) &&
            matchesName(row.name, search, locale)),
      );
      const localRows = named.map((row) => ({
        ...row,
        sources: row.sources.filter((source) => isBiomeSource(source, biome)),
      }));
      const matching = localRows.filter(({ sources }) =>
        sources.some((source) => toolbarState.showsSource(source)),
      );
      return {
        biome,
        dishes: entries.filter((row) => row.reportCategory === "almanac-item" && dishes.has(row.id))
          .length,
        furniture: entries.filter(
          (row) => row.reportCategory === "almanac-item" && furniture.has(row.id),
        ).length,
        localRows,
        matching,
        name,
        nameMatch,
        petSkins: entries.filter((row) => row.reportCategory === "pet-skin").length,
        recipes: entries.filter((row) => row.reportCategory === "recipe").length,
        remaining: entries.filter((row) => !row.completed).length,
      };
    }),
  );
  registerSourceFilters("mine-biome-contents", () =>
    rows.flatMap(({ sources }) =>
      sources.filter((source) => biomes.some((biome) => isBiomeSource(source, biome))),
    ),
  );
  registerPageSearch(() => ({
    filtered: filteredCounts(
      sections.flatMap(({ localRows }) =>
        localRows.map((row) =>
          shelfFacts(row, row.completed, userState.progressContext, toolbarState.showsSource),
        ),
      ),
    ),
    visible: sections.reduce(
      (count, { matching, nameMatch }) => count + matching.length + Number(nameMatch),
      0,
    ),
  }));
</script>

<div class="depth-chart" {@attach reportable}>
  {#if !search}
    <div class="setter">
      <Stepper
        accentColor="var(--color-category-mines)"
        decrementDisabled={floor === 0}
        decrementLabel="Go up one floor"
        incrementDisabled={floor === max}
        incrementLabel="Go down one floor"
        label="Floor progress"
        onDecrement={() => onChange(floor - 1)}
        onIncrement={() => onChange(floor + 1)}
      >
        <span class="readout"><span class="font-hand">{printed}</span> / {total}</span>
      </Stepper>
    </div>
    <div
      class="shaft"
      class:scrubbing={preview !== undefined}
      role="slider"
      tabindex="0"
      aria-label="Deepest floor"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={`Floor ${printed} of ${total}`}
      {@attach input}
    >
      <svg class="ground" viewBox="0 0 90 15" fill="none" aria-hidden="true">
        <path d="M0 14H90 M10 14l-3-5m3 5 1-8m9 8 3-5m47 5-3-7m3 7 4-5m8 5 2-7" />
      </svg>
      <span class="walls" aria-hidden="true"></span>
      {#each rungs as rung (rung)}
        <span class="rung" style:inset-block-start={`${(100 * rung) / max}%`} aria-hidden="true"
        ></span>
      {/each}
      <span class="fill" style:block-size={`${(100 * shown) / max}%`} aria-hidden="true">
        <span class="depth font-hand">{printed}</span>
      </span>
    </div>
  {/if}
  <ol class="biomes" class:searching={!!search}>
    {#each sections as { biome, dishes: dishCount, furniture: furnitureCount, matching, name, nameMatch, petSkins, recipes, remaining } (biome.id)}
      {@const start = formatNumber(biome.floors.start, locale)}
      {@const end = formatNumber(biome.floors.end, locale)}
      {#if !search || nameMatch || matching.length}
        <li>
          {#snippet heading()}
            <span class="biome-heading">
              {#if name}
                <span>{name}</span>
              {:else}
                <span class="blank"><span class="sr-only">Unreached biome</span></span>
              {/if}
              <span class="range">{start}–{end}</span>
            </span>
          {/snippet}
          {#if name}
            <details
              open={search ? true : undefined}
              ontoggle={(event) => {
                if (event.currentTarget.open) expandedBiomes.add(biome.id);
                else expandedBiomes.delete(biome.id);
              }}
            >
              <summary>
                {@render heading()}
                <span class="counts">
                  {#if recipes}
                    {@const count = formatNumber(recipes, locale)}
                    <span>{plural(recipes, [`${count} recipe`, `${count} recipes`])}</span>
                  {/if}
                  {#if dishCount}
                    {@const count = formatNumber(dishCount, locale)}
                    <span>{plural(dishCount, [`${count} dish`, `${count} dishes`])}</span>
                  {/if}
                  {#if furnitureCount}
                    <span>{`${formatNumber(furnitureCount, locale)} furniture`}</span>
                  {/if}
                  {#if petSkins}
                    {@const count = formatNumber(petSkins, locale)}
                    <span>{plural(petSkins, [`${count} pet skin`, `${count} pet skins`])}</span>
                  {/if}
                  <span class:finished={!remaining}>
                    {#if remaining}{`${formatNumber(remaining, locale)} to do`}{:else}Nothing left{/if}
                  </span>
                </span>
              </summary>
              {#if matching.length && (search || expandedBiomes.has(biome.id))}
                <div class="biome-contents">
                  <MineBiomeContents {locale} rows={matching} />
                </div>
              {/if}
            </details>
          {:else}
            {@render heading()}
          {/if}
        </li>
      {/if}
    {/each}
  </ol>
</div>

<style>
  .depth-chart {
    display: grid;
    min-inline-size: 0;
    grid-template-columns: clamp(4.5rem, 14vw, 12rem) minmax(0, 1fr);
    column-gap: 0.75rem;
    padding-block-end: 1rem;
  }

  .setter {
    width: min(12rem, 100%);
    grid-column: 1 / -1;
    margin-block-end: 1.5rem;
  }

  .readout,
  .range {
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .readout .font-hand {
    color: var(--color-category-mines-text);
    font-size: var(--text-lg);
  }

  .shaft {
    position: relative;
    min-inline-size: 44px;
    cursor: ns-resize;
    touch-action: pan-x;
  }

  .ground {
    position: absolute;
    inset: auto 0 calc(100% - 1px);
    width: 100%;
    height: 1.25rem;
    stroke: var(--color-meter-rule);
  }

  .walls {
    position: absolute;
    inset: 0 32%;
    border-block-end: var(--size-meter-rule) solid var(--color-meter-rule);
    border-inline: var(--size-meter-rule) solid var(--color-meter-rule);
  }

  .walls::before,
  .walls::after {
    position: absolute;
    inset-block: 0;
    inline-size: clamp(0.6rem, 2vw, 1.25rem);
    background: repeating-linear-gradient(
      135deg,
      transparent 0 3px,
      var(--color-meter-tick) 3px 4px
    );
    content: "";
    opacity: 0.45;
  }

  .walls::before {
    inset-inline-end: 100%;
  }
  .walls::after {
    inset-inline-start: 100%;
  }

  .rung {
    position: absolute;
    inset-inline: 32%;
    border-block-start: 1px solid var(--color-meter-tick);
  }

  .fill {
    position: absolute;
    inset-block-start: 0;
    inset-inline: 38%;
    background: var(--color-category-mines);
    filter: url(#pencil);
    pointer-events: none;
    transition: block-size 160ms ease-out;
  }

  .depth {
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: calc(100% + 0.4rem);
    color: var(--color-category-mines-text);
    font-size: var(--text-sm);
    transform: translateY(50%);
  }

  .biomes {
    display: grid;
    grid-auto-rows: minmax(6.25rem, 1fr);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .biomes.searching {
    grid-column: 1 / -1;
    grid-auto-rows: auto;
  }

  .biomes li {
    min-inline-size: 0;
    padding-block: 0.25rem 0.75rem;
    border-block-start: 1px solid var(--color-rule);
  }

  .biome-heading,
  .counts {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.6rem;
    overflow-wrap: anywhere;
  }

  .blank {
    inline-size: min(6rem, 100%);
    min-block-size: 1em;
    border-block-end: 1px solid var(--color-ink-muted);
  }

  summary {
    position: relative;
    display: block;
    min-block-size: 44px;
    padding-inline-start: 0.9rem;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::before {
    position: absolute;
    inset-block-start: 0.45em;
    inset-inline-start: 0.16rem;
    inline-size: 0.4rem;
    block-size: 0.4rem;
    border-block-start: 1px solid var(--color-ink-muted);
    border-inline-end: 1px solid var(--color-ink-muted);
    content: "";
    transform: rotate(45deg);
  }

  details[open] summary::before {
    transform: rotate(135deg);
  }

  .biome-contents {
    max-block-size: 6rem;
    overflow: auto;
  }

  .searching .biome-contents {
    max-block-size: none;
    overflow: visible;
  }

  .counts {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .counts > :last-child:not(.finished) {
    color: var(--color-category-mines-text);
  }

  .scrubbing .fill {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
