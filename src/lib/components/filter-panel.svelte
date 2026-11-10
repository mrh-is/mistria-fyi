<script lang="ts">
  import IconBan from "@tabler/icons-svelte-runes/icons/ban";
  import IconChevronDown from "@tabler/icons-svelte-runes/icons/chevron-down";
  import IconEye from "@tabler/icons-svelte-runes/icons/eye";
  import IconInfoCircle from "@tabler/icons-svelte-runes/icons/info-circle";
  import IconTags from "@tabler/icons-svelte-runes/icons/tags";
  import { MediaQuery } from "svelte/reactivity";

  import BlockySwitch from "#lib/components/blocky-switch.svelte";
  import { SOURCE_FILTER_ICON } from "#lib/components/icon/index.js";
  import SourceExplainerDialog from "#lib/components/source-explainer-dialog.svelte";
  import { sortSourceFiltersByLabel, sourceFilterLabel } from "#lib/data/source-filters.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { page } from "$app/state";

  import type { Icon as AppIcon } from "@tabler/icons-svelte-runes";
  import type { Snippet } from "svelte";

  import type { FilterSectionId } from "#lib/stores/toolbar-state.svelte.js";

  let { onFilterChange }: { onFilterChange?: () => void } = $props();

  // Past this many enabled types, the sources summary names a count instead of listing them.
  const MAX_LISTED_SOURCE_TYPES = 3;

  // Phone layouts: below the app's 701px gutter breakpoint, or a phone held sideways (app.css).
  const compact = new MediaQuery(
    "(max-width: 700px), (orientation: landscape) and (max-height: 500px)",
    false,
  );

  let sourcesExplainerOpen = $state(false);
  let sourceSummary = $derived.by(() => {
    const enabled = sortSourceFiltersByLabel(toolbarState.sourceFilters, page.data.locale).filter(
      (filter) => toolbarState.enabledSourceFilterIds.has(filter.id),
    );
    if (enabled.length === toolbarState.sourceFilters.length) return "All types";
    if (enabled.length === 0) return "No types";
    if (enabled.length > MAX_LISTED_SOURCE_TYPES) {
      return /* @wc-context: visibility source types summary */ `${enabled.length} of ${toolbarState.sourceFilters.length}`;
    }
    // Labels are title-like on their own; mid-phrase they read as ordinary nouns.
    const labels = enabled.map((filter) =>
      sourceFilterLabel(filter.id, page.data.locale).toLocaleLowerCase(page.data.locale),
    );
    if (labels.length === 1) return `Only ${labels[0] ?? ""}`;
    const list = new Intl.ListFormat(page.data.locale, { type: "conjunction", style: "short" });
    const phrase = list.format(labels);
    return phrase.charAt(0).toLocaleUpperCase(page.data.locale) + phrase.slice(1);
  });
  let showSummary = $derived(toolbarState.showUnobtainable ? "Everything" : "Obtainable");

  function isCollapsed(section: FilterSectionId): boolean {
    return compact.current && !toolbarState.expandedFilterSections.has(section);
  }
</script>

{#snippet sourceSummaryText()}{sourceSummary}{/snippet}

{#snippet showSummaryText()}{showSummary}{/snippet}

{#snippet sectionHeading(
  section: FilterSectionId,
  SectionIcon: AppIcon,
  label: string,
  summary: Snippet,
)}
  {#if compact.current}
    {@const expanded = toolbarState.expandedFilterSections.has(section)}
    <h3 id="{section}-filter-label">
      <button
        class="disclosure"
        type="button"
        aria-expanded={expanded}
        aria-controls="{section}-filter-body"
        onclick={() => {
          toolbarState.toggleFilterSection(section);
        }}
      >
        <SectionIcon class="size-3.5 shrink-0" />
        <span class="disclosure__label">{label}</span>
        <!-- Stays mounted so it can fade; CSS hides it (& drops it from the name) once faded out. -->
        <span class="disclosure__summary" class:disclosure__summary--hidden={expanded}
          >{@render summary()}</span
        >
        <IconChevronDown class="disclosure__chevron size-3.5 shrink-0" />
      </button>
    </h3>
  {:else}
    <h3 id="{section}-filter-label"><SectionIcon class="size-3.5" />{label}</h3>
  {/if}
{/snippet}

<SourceExplainerDialog bind:open={sourcesExplainerOpen} filters={toolbarState.sourceFilters} />

<div class="filters">
  {#if toolbarState.sourceFilters.length > 0}
    <section class="filter-section" aria-labelledby="sources-filter-label">
      <div class="filter-section__heading" class:filter-section__heading--compact={compact.current}>
        {@render sectionHeading("sources", IconTags, "Source types", sourceSummaryText)}
        <!-- Sits just left of the disclosure caret, so every section's caret lines up. -->
        {#if !isCollapsed("sources")}
          <button
            class="info-button"
            type="button"
            aria-label="About source types"
            onclick={() => (sourcesExplainerOpen = true)}><IconInfoCircle class="size-4" /></button
          >
        {/if}
      </div>
      <div
        id="sources-filter-body"
        class="collapsible"
        class:collapsible--collapsed={isCollapsed("sources")}
        inert={isCollapsed("sources")}
      >
        <div class="collapsible__inner">
          <div class="chip-row">
            {#each sortSourceFiltersByLabel(toolbarState.sourceFilters, page.data.locale) as filter (filter.id)}
              {@const SourceIcon = SOURCE_FILTER_ICON[filter.id]}
              {@const selected = toolbarState.enabledSourceFilterIds.has(filter.id)}
              <button
                class="filter-chip"
                class:filter-chip--active={selected}
                type="button"
                aria-pressed={selected}
                onclick={() => {
                  toolbarState.toggleSourceFilter(filter);
                  onFilterChange?.();
                }}
              >
                <SourceIcon class="size-3" />{sourceFilterLabel(filter.id, page.data.locale)}
              </button>
            {/each}
          </div>
        </div>
      </div>
    </section>
  {/if}

  {#if toolbarState.hasAlmanacFilters}
    <section class="filter-section" aria-labelledby="show-filter-label">
      {@render sectionHeading("show", IconEye, "Show", showSummaryText)}
      <div
        id="show-filter-body"
        class="collapsible"
        class:collapsible--collapsed={isCollapsed("show")}
        inert={isCollapsed("show")}
      >
        <div class="collapsible__inner">
          <div class="toggle-row">
            <div class="toggle">
              <BlockySwitch
                checked={toolbarState.showUnobtainable}
                onCheckedChange={() => {
                  toolbarState.showUnobtainable = !toolbarState.showUnobtainable;
                  onFilterChange?.();
                }}
              >
                <span class="toggle__label"><IconBan class="size-3.5 shrink-0" />Unobtainable</span>
              </BlockySwitch>
            </div>
          </div>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .filter-section {
    padding: 11px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-ink-hairline) 28%, transparent);
  }

  .filter-section h3,
  .filter-section__heading,
  .disclosure,
  .toggle-row,
  .toggle__label {
    display: flex;
    align-items: center;
  }

  .filter-section h3 {
    gap: 6px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .filter-section__heading {
    justify-content: space-between;
    gap: 8px;
  }

  .filter-section__heading h3 {
    min-width: 0;
    flex: 1;
  }

  /* The disclosure spans the row; the info button overlays it just left of the caret. */
  .filter-section__heading--compact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .filter-section__heading--compact > * {
    grid-row: 1;
  }

  .filter-section__heading--compact h3 {
    grid-column: 1 / -1;
  }

  .filter-section__heading--compact .info-button {
    z-index: 1;
    grid-column: 2;
    margin-inline-end: 20px;
  }

  .disclosure {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    gap: 6px;
    margin-block: -6px;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-align: start;
  }

  .disclosure:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .disclosure__label {
    flex-shrink: 0;
  }

  .disclosure__summary {
    min-width: 0;
    overflow: hidden;
    color: var(--color-ink);
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .disclosure__summary::before {
    content: "· ";
    color: var(--color-ink-muted);
  }

  /*
   * Disclosure motion. Height leads in both directions, so a tap moves something at once; closing
   * runs shorter than opening, & every curve decelerates, so nothing waits on a slow start.
   */
  .filters {
    --disclosure-open-ms: 260ms;
    --disclosure-close-ms: 240ms;
    --disclosure-ease: cubic-bezier(0.2, 0.6, 0.35, 1);
  }

  .disclosure :global(.disclosure__chevron) {
    margin-inline-start: auto;
    transition: transform var(--disclosure-close-ms) var(--disclosure-ease);
  }

  .disclosure[aria-expanded="true"] :global(.disclosure__chevron) {
    transform: rotate(180deg);
    transition: transform var(--disclosure-open-ms) var(--disclosure-ease);
  }

  /* The summary fades in as the body closes & out as it opens, over about the whole motion. */
  .disclosure__summary {
    transition: opacity var(--disclosure-close-ms) ease-out;
  }

  .disclosure__summary--hidden {
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--disclosure-open-ms) ease-out,
      visibility 0s var(--disclosure-open-ms);
  }

  /*
   * Opening: the height grows at once & the contents fade in shortly after, overlapping it.
   * Closing: the height shrinks at once while the contents fade out quickly underneath it.
   * The inner box's padding & matching negative margin leave room for focus outlines.
   */
  .collapsible {
    display: grid;
    grid-template-rows: 1fr;
    transition:
      grid-template-rows var(--disclosure-open-ms) var(--disclosure-ease),
      visibility 0s;
  }

  .collapsible__inner {
    min-height: 0;
    padding: 4px;
    margin: -4px;
    overflow: hidden;
    transition: opacity 160ms ease-out 60ms;
  }

  .collapsible--collapsed {
    grid-template-rows: 0fr;
    visibility: hidden;
    transition:
      grid-template-rows var(--disclosure-close-ms) var(--disclosure-ease),
      visibility 0s var(--disclosure-close-ms);
  }

  .collapsible--collapsed > .collapsible__inner {
    opacity: 0;
    transition: opacity 90ms ease-out;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }

  .filter-chip {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 10px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    color: var(--color-ink-muted);
    background: var(--color-paper-sunken);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  @media (hover: hover) and (pointer: fine) {
    .filter-chip {
      min-height: 34px;
    }
  }

  .filter-chip--active {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--color-paper-raised));
  }

  .filter-chip:is(:hover, :focus-visible),
  .info-button:is(:hover, :focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .info-button {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    color: var(--color-ink-muted);
  }

  .toggle-row {
    align-items: stretch;
    gap: 5px;
    margin-top: 7px;
  }

  .toggle {
    display: flex;
    min-width: 0;
    min-height: 44px;
    flex: 1;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    background: var(--color-paper-sunken);
  }

  .toggle :global(label) {
    width: 100%;
    flex-direction: row-reverse;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px;
  }

  .toggle__label {
    min-width: 0;
    gap: 6px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .disclosure :global(.disclosure__chevron),
    .disclosure__summary,
    .collapsible,
    .collapsible__inner {
      transition-duration: 0.01ms !important;
      transition-delay: 0s !important;
    }
  }
</style>
