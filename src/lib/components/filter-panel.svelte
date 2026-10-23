<script lang="ts">
  import IconBan from "@tabler/icons-svelte-runes/icons/ban";
  import IconChevronDown from "@tabler/icons-svelte-runes/icons/chevron-down";
  import IconCircleCheck from "@tabler/icons-svelte-runes/icons/circle-check";
  import IconClock from "@tabler/icons-svelte-runes/icons/clock";
  import IconEye from "@tabler/icons-svelte-runes/icons/eye";
  import IconInfoCircle from "@tabler/icons-svelte-runes/icons/info-circle";
  import IconTags from "@tabler/icons-svelte-runes/icons/tags";
  import { prefersReducedMotion } from "svelte/motion";
  import { MediaQuery } from "svelte/reactivity";

  import BlockySwitch from "#lib/components/blocky-switch.svelte";
  import { weatherIcon } from "#lib/components/icon/icon-maps.js";
  import { Icon, SOURCE_FILTER_ICON } from "#lib/components/icon/index.js";
  import SourceExplainerDialog from "#lib/components/source-explainer-dialog.svelte";
  import { sortSourceFiltersByLabel, sourceFilterLabel } from "#lib/data/source-filters.js";
  import { weathersForSeason } from "#lib/engine/world-state.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
  import { seasonLabel, seasonLabelAbbr, weatherLabel } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { Icon as AppIcon } from "@tabler/icons-svelte-runes";
  import type { Snippet } from "svelte";

  import type { FilterSectionId } from "#lib/stores/toolbar-state.svelte.js";
  import type { AvailabilityWindow } from "#lib/types/availability.js";
  import type { Season, Weather } from "#lib/types/tracker-data.js";

  let {
    onFilterChange,
    showWorldStateFilters,
  }: { onFilterChange?: () => void; showWorldStateFilters: boolean } = $props();

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const allWeathers: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];
  const TRANSITION_MS = 180;
  // Past this many enabled types, the sources summary names a count instead of listing them.
  const MAX_LISTED_SOURCE_TYPES = 3;
  const availabilityLabels: Record<AvailabilityWindow, string> = {
    anytime: m.availability_anytime(),
    later: m.availability_later(),
    now: m.availability_now(),
  };

  // Phone layouts: below the app's 701px gutter breakpoint, or a phone held sideways (app.css).
  const compact = new MediaQuery(
    "(max-width: 700px), (orientation: landscape) and (max-height: 500px)",
    false,
  );

  let sourcesExplainerOpen = $state(false);
  let currentSeason = $derived(userState.state.worldState.season);
  let availabilityEverything = $derived(
    userState.state.availabilityWindows.length === AVAILABILITY_WINDOWS.length,
  );
  let sourceSummary = $derived.by(() => {
    const enabled = sortSourceFiltersByLabel(toolbarState.sourceFilters, page.data.locale).filter(
      (filter) => toolbarState.enabledSourceFilterIds.has(filter.id),
    );
    if (enabled.length === toolbarState.sourceFilters.length) return m.visibility_sources_all();
    if (enabled.length === 0) return m.visibility_sources_none();
    if (enabled.length > MAX_LISTED_SOURCE_TYPES) {
      return m.visibility_source_types_summary({
        enabled: enabled.length,
        total: toolbarState.sourceFilters.length,
      });
    }
    // Labels are title-like on their own; mid-phrase they read as ordinary nouns.
    const labels = enabled.map((filter) =>
      sourceFilterLabel(filter.id, page.data.locale).toLocaleLowerCase(page.data.locale),
    );
    if (labels.length === 1) return m.visibility_sources_only({ type: labels[0] ?? "" });
    const list = new Intl.ListFormat(page.data.locale, { type: "conjunction", style: "short" });
    const phrase = list.format(labels);
    return phrase.charAt(0).toLocaleUpperCase(page.data.locale) + phrase.slice(1);
  });
  let showSummary = $derived.by(() => {
    const completed = userState.state.showCompleted;
    if (!toolbarState.hasAlmanacFilters) {
      return completed ? m.visibility_show_everything() : m.visibility_show_todo();
    }
    if (toolbarState.showUnobtainable) {
      return completed ? m.visibility_show_everything() : m.visibility_show_uncompleted();
    }
    return completed ? m.visibility_show_obtainable() : m.visibility_show_todo();
  });
  let availableWeathers = $derived(weathersForSeason(currentSeason));
  let hasSpecialWeather = $derived(availableWeathers.includes("special"));
  let weatherColumns = $derived(
    `repeat(3, minmax(0, 1fr)) minmax(0, ${hasSpecialWeather ? "1fr" : "0fr"})`,
  );

  interface WeatherSlot {
    icon: AppIcon;
    label: string;
  }

  function buildWeatherSlots(season: Season): Record<Weather, WeatherSlot> {
    return Object.fromEntries(
      allWeathers.map((weather) => [
        weather,
        { icon: weatherIcon(weather, season), label: weatherLabel(weather, season) },
      ]),
    ) as Record<Weather, WeatherSlot>;
  }

  /** Joins labels with “+”, lowercasing all but the first, since they read mid-phrase. */
  function joinMidPhrase(labels: string[]): string {
    return labels
      .map((label, index) => (index === 0 ? label : label.toLocaleLowerCase(page.data.locale)))
      .join(" + ");
  }

  function isCollapsed(section: FilterSectionId): boolean {
    return compact.current && !toolbarState.expandedFilterSections.has(section);
  }

  function transitionDuration(): number {
    return prefersReducedMotion.current ? 0 : TRANSITION_MS;
  }

  let weatherSlotDisplay = $state(buildWeatherSlots(userState.state.worldState.season));
  const weatherSlotFading = $state(
    Object.fromEntries(allWeathers.map((weather) => [weather, false])) as Record<Weather, boolean>,
  );

  $effect(() => {
    const next = buildWeatherSlots(currentSeason);
    const changed = allWeathers.filter(
      (weather) =>
        next[weather].label !== weatherSlotDisplay[weather].label ||
        next[weather].icon !== weatherSlotDisplay[weather].icon,
    );
    if (changed.length === 0) return;
    for (const weather of changed) weatherSlotFading[weather] = true;
    const timeout = setTimeout(() => {
      weatherSlotDisplay = next;
      for (const weather of changed) weatherSlotFading[weather] = false;
    }, transitionDuration() / 2);
    return () => {
      clearTimeout(timeout);
    };
  });

  function toggleAvailability(window: AvailabilityWindow): void {
    userState.toggleAvailabilityWindow(window);
    onFilterChange?.();
  }

  // Native radio-group keyboard model: arrows move selection (wrapping), Home & End jump.
  function moveRadioFocus(event: KeyboardEvent & { currentTarget: HTMLElement }): void {
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -1,
    };
    const group = event.currentTarget.closest('[role="radiogroup"]');
    if (!group) return;
    const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
    const current = radios.indexOf(event.currentTarget as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = radios.length - 1;
    } else if (event.key in step) {
      next = (current + (step[event.key] ?? 0) + radios.length) % radios.length;
    }
    if (current === -1 || next === undefined) return;
    event.preventDefault();
    radios[next]?.focus();
    radios[next]?.click();
  }
</script>

{#snippet availabilitySummary()}
  {#if availabilityEverything}
    {m.visibility_when_everything()}
  {:else}
    {`${joinMidPhrase(userState.state.availabilityWindows.map((window) => availabilityLabels[window]))} · `}<span
      class="disclosure__icons"
      ><Icon.Season season={currentSeason} class="size-3" /><Icon.Weather
        season={currentSeason}
        weather={userState.state.worldState.weather}
        class="size-3"
      /></span
    ><span class="sr-only"
      >{[
        seasonLabel(currentSeason, page.data.locale),
        weatherLabel(userState.state.worldState.weather, currentSeason),
      ].join(", ")}</span
    >
  {/if}
{/snippet}

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
  {#if showWorldStateFilters}
    <section class="filter-section" aria-labelledby="availability-filter-label">
      {@render sectionHeading(
        "availability",
        IconClock,
        m.visibility_when_to_find(),
        availabilitySummary,
      )}
      <div
        id="availability-filter-body"
        class="collapsible"
        class:collapsible--collapsed={isCollapsed("availability")}
        inert={isCollapsed("availability")}
      >
        <div class="collapsible__inner">
          <div class="chip-row chip-row--availability">
            {#each AVAILABILITY_WINDOWS as window (window)}
              {@const selected = userState.state.availabilityWindows.includes(window)}
              <button
                class="filter-chip filter-chip--wide"
                class:filter-chip--active={selected}
                type="button"
                aria-pressed={selected}
                onclick={() => {
                  toggleAvailability(window);
                }}>{availabilityLabels[window]}</button
              >
            {/each}
          </div>

          <div class="world-state-grid">
            <div>
              <p>{m.visibility_season_label()}</p>
              <div class="radio-strip" role="radiogroup" aria-label={m.visibility_season_label()}>
                {#each seasons as season (season)}
                  {@const selected = season === currentSeason}
                  <button
                    type="button"
                    role="radio"
                    onkeydown={moveRadioFocus}
                    aria-label={seasonLabel(season, page.data.locale)}
                    aria-checked={selected}
                    tabindex={selected ? 0 : -1}
                    class:radio-strip__active={selected}
                    onclick={() => {
                      userState.setSeason(season);
                    }}><Icon.Season {season} class="size-3" />{seasonLabelAbbr(season)}</button
                  >
                {/each}
              </div>
            </div>

            <div>
              <p>{m.visibility_weather_label()}</p>
              <div
                class="radio-strip radio-strip--weather"
                role="radiogroup"
                aria-label={m.visibility_weather_label()}
                style:grid-template-columns={weatherColumns}
                style:transition-duration="{transitionDuration()}ms"
              >
                {#each allWeathers as weather (weather)}
                  {@const selected = weather === userState.state.worldState.weather}
                  {@const isSpecial = weather === "special"}
                  {@const SlotIcon = weatherSlotDisplay[weather].icon}
                  <div
                    class="radio-strip__slot"
                    class:radio-strip__slot--last-visible={!hasSpecialWeather &&
                      weather === "heavy_inclement"}
                  >
                    <button
                      type="button"
                      role="radio"
                      onkeydown={moveRadioFocus}
                      aria-label={weatherLabel(weather, currentSeason)}
                      aria-checked={selected}
                      aria-hidden={isSpecial && !hasSpecialWeather}
                      class:radio-strip__active={selected}
                      disabled={isSpecial && !hasSpecialWeather}
                      tabindex={selected && !(isSpecial && !hasSpecialWeather) ? 0 : -1}
                      onclick={() => {
                        userState.setWeather(weather);
                      }}
                    >
                      <span
                        class="radio-strip__content"
                        style:opacity={weatherSlotFading[weather] ? 0 : 1}
                        style:transition-duration="{transitionDuration() / 2}ms"
                      >
                        <SlotIcon class="size-3" />
                        {weatherSlotDisplay[weather].label}
                      </span>
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  {/if}

  {#if toolbarState.sourceFilters.length > 0}
    <section class="filter-section" aria-labelledby="sources-filter-label">
      <div class="filter-section__heading" class:filter-section__heading--compact={compact.current}>
        {@render sectionHeading(
          "sources",
          IconTags,
          m.visibility_source_types(),
          sourceSummaryText,
        )}
        <!-- Sits just left of the disclosure caret, so every section's caret lines up. -->
        {#if !isCollapsed("sources")}
          <button
            class="info-button"
            type="button"
            aria-label={m.visibility_source_types_about_aria()}
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

  <section class="filter-section" aria-labelledby="show-filter-label">
    {@render sectionHeading("show", IconEye, m.visibility_show_heading(), showSummaryText)}
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
              checked={userState.state.showCompleted}
              onCheckedChange={() => {
                userState.toggleShowCompleted();
                onFilterChange?.();
              }}
            >
              <span class="toggle__label"
                ><IconCircleCheck
                  class="size-3.5 shrink-0"
                />{m.visibility_completed_toggle()}</span
              >
            </BlockySwitch>
          </div>
          {#if toolbarState.hasAlmanacFilters}
            <div class="toggle">
              <BlockySwitch
                checked={toolbarState.showUnobtainable}
                onCheckedChange={() => {
                  toolbarState.showUnobtainable = !toolbarState.showUnobtainable;
                  onFilterChange?.();
                }}
              >
                <span class="toggle__label"
                  ><IconBan class="size-3.5 shrink-0" />{m.visibility_unobtainable_toggle()}</span
                >
              </BlockySwitch>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>
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

  .disclosure__icons {
    display: inline-flex;
    gap: 3px;
    vertical-align: -2px;
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

  .chip-row--availability {
    flex-wrap: nowrap;
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

  .filter-chip--wide {
    flex: 1;
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

  .world-state-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
    margin-top: 9px;
  }

  .world-state-grid p {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-3xs);
  }

  .radio-strip {
    display: flex;
    min-width: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
  }

  .radio-strip button {
    display: flex;
    min-width: 0;
    min-height: 44px;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 3px;
    overflow: hidden;
    padding: 4px 5px;
    border-right: 1px solid color-mix(in srgb, var(--color-ink-hairline) 28%, transparent);
    color: var(--color-ink-muted);
    background: var(--color-paper-sunken);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .radio-strip button {
      min-height: 34px;
    }
  }

  .radio-strip button:is(:hover, :focus-visible) {
    outline: 0;
    /* stylelint-disable-next-line declaration-property-unit-disallowed-list -- an inset hover ring, not an elevation */
    box-shadow: inset 0 0 0 2px var(--primary);
  }

  .radio-strip button,
  .radio-strip__content,
  .radio-strip--weather {
    transition-timing-function: ease-out;
  }

  .radio-strip__content {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 3px;
    transition-property: opacity;
  }

  .radio-strip--weather {
    display: grid;
    transition-property: grid-template-columns;
  }

  .radio-strip__slot {
    min-width: 0;
    overflow: hidden;
  }

  .radio-strip__slot button {
    width: 100%;
    height: 100%;
  }

  .radio-strip > button:last-child,
  .radio-strip__slot:last-child button {
    border-right: 0;
  }

  .radio-strip__slot--last-visible button {
    border-right: 0;
  }

  .radio-strip .radio-strip__active {
    color: var(--color-ink);
    background: color-mix(in srgb, var(--primary) 12%, var(--color-paper-raised));
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

  @media (max-width: 479px) {
    .world-state-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .radio-strip button,
    .radio-strip__content,
    .radio-strip--weather,
    .disclosure :global(.disclosure__chevron),
    .disclosure__summary,
    .collapsible,
    .collapsible__inner {
      transition-duration: 0.01ms !important;
      transition-delay: 0s !important;
    }
  }
</style>
