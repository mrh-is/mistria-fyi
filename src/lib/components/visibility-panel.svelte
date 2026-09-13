<script lang="ts">
  import {
    IconCheck,
    IconClock,
    IconInfoCircle,
    IconRotate,
    IconTags,
  } from "@tabler/icons-svelte-runes";

  import { weatherIcon } from "$lib/components/icon/icon-maps.js";
  import { Icon } from "$lib/components/icon/index.js";
  import SourceExplainerDialog from "$lib/components/source-explainer-dialog.svelte";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { AVAILABILITY_WINDOWS, DEFAULT_AVAILABILITY_WINDOWS } from "$lib/types/availability.js";
  import { seasonLabel, weatherLabel, weathersForSeason } from "$lib/utils/format.js";

  import type { AvailabilityWindow } from "$lib/types/availability.js";
  import type { Season } from "$lib/types/tracker-data.js";

  let { showSeasonality }: { showSeasonality: boolean } = $props();

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const availabilityLabels: Record<AvailabilityWindow, string> = {
    anytime: "Anytime",
    later: "Later",
    now: "Now",
  };

  let sourcesExplainerOpen = $state(false);
  let currentSeason = $derived(userState.state.worldState.season);
  let availableWeathers = $derived(weathersForSeason(currentSeason));
  let CurrentWeather = $derived(weatherIcon(userState.state.worldState.weather, currentSeason));
  let filtersActive = $derived(
    userState.state.availabilityWindows.join(",") !== DEFAULT_AVAILABILITY_WINDOWS.join(",") ||
      userState.state.showCompleted ||
      toolbarState.sourceFilterActive,
  );

  function resetFilters(): void {
    userState.setAvailabilityWindows(DEFAULT_AVAILABILITY_WINDOWS);
    if (userState.state.showCompleted) userState.toggleShowCompleted();
    toolbarState.resetSourceFilters();
  }

  function toggleAvailability(window: AvailabilityWindow): void {
    userState.toggleAvailabilityWindow(window);
  }

  $effect(() => {
    if (!availableWeathers.includes(userState.state.worldState.weather)) {
      userState.setWeather("calm");
    }
  });
</script>

<SourceExplainerDialog bind:open={sourcesExplainerOpen} />

<div class="filters">
  {#if showSeasonality}
    <section class="filter-section" aria-labelledby="availability-filter-label">
      <h3 id="availability-filter-label"><IconClock class="size-3.5" />When to find</h3>
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
          <p><Icon.Season season={currentSeason} class="size-3" />Season</p>
          <div class="radio-strip" aria-label="Season">
            {#each seasons as season (season)}
              {@const selected = season === currentSeason}
              <button
                type="button"
                aria-label={seasonLabel(season)}
                aria-pressed={selected}
                class:radio-strip__active={selected}
                onclick={() => {
                  userState.setSeason(season);
                }}>{seasonLabel(season).slice(0, 3)}</button
              >
            {/each}
          </div>
        </div>

        <div>
          <p>
            <CurrentWeather class="size-3" />Weather
          </p>
          <div class="radio-strip" aria-label="Weather">
            {#each availableWeathers as weather (weather)}
              {@const selected = weather === userState.state.worldState.weather}
              <button
                type="button"
                aria-label={weatherLabel(weather, currentSeason)}
                aria-pressed={selected}
                class:radio-strip__active={selected}
                onclick={() => {
                  userState.setWeather(weather);
                }}>{weatherLabel(weather, currentSeason).replace(" weather", "")}</button
              >
            {/each}
          </div>
        </div>
      </div>
    </section>
  {/if}

  {#if toolbarState.sourceFilters.length > 0}
    <section class="filter-section" aria-labelledby="source-filter-label">
      <div class="filter-section__heading">
        <h3 id="source-filter-label"><IconTags class="size-3.5" />Sources</h3>
        <button
          class="info-button"
          type="button"
          aria-label="About source groups"
          onclick={() => (sourcesExplainerOpen = true)}><IconInfoCircle class="size-4" /></button
        >
      </div>
      <div class="chip-row">
        {#each toolbarState.sourceFilters as filter (filter.label)}
          {@const SourceIcon = filter.icon}
          {@const selected = toolbarState.activeSourceLabels.has(filter.label)}
          <button
            class="filter-chip"
            class:filter-chip--active={selected}
            type="button"
            aria-pressed={selected}
            onclick={() => {
              toolbarState.toggleSourceFilter(filter);
            }}
          >
            <SourceIcon class="size-3" />{filter.label}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="filter-section filter-section--completed" aria-label="Completion visibility">
    <span><IconCheck class="size-4" />Show completed</span>
    <Switch
      aria-label="Show completed items"
      checked={userState.state.showCompleted}
      onCheckedChange={() => {
        userState.toggleShowCompleted();
      }}
    />
  </section>

  {#if filtersActive}
    <button class="reset-button" type="button" onclick={resetFilters}>
      <IconRotate class="size-3.5" />Clear all filters
    </button>
  {/if}
</div>

<style>
  .filter-section {
    padding: 11px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 28%, transparent);
  }

  .filter-section h3,
  .filter-section__heading,
  .filter-section--completed,
  .filter-section--completed span {
    display: flex;
    align-items: center;
  }

  .filter-section h3 {
    gap: 6px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .filter-section__heading,
  .filter-section--completed {
    justify-content: space-between;
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
    min-height: 34px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 10px;
    border: 1px solid color-mix(in srgb, var(--hairline) 34%, transparent);
    color: var(--ink-muted);
    background: var(--paper-deep);
    font-family: var(--font-controls);
    font-size: 10px;
  }

  .filter-chip--wide {
    flex: 1;
  }

  .filter-chip--active {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 11%, var(--paper-raised));
  }

  .filter-chip:is(:hover, :focus-visible),
  .radio-strip button:is(:hover, :focus-visible),
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
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 10px;
  }

  .radio-strip {
    display: flex;
    min-width: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--hairline) 34%, transparent);
  }

  .radio-strip button {
    min-width: 0;
    min-height: 34px;
    flex: 1;
    overflow: hidden;
    padding: 4px 5px;
    border-right: 1px solid color-mix(in srgb, var(--hairline) 28%, transparent);
    color: var(--ink-muted);
    background: var(--paper-deep);
    font-family: var(--font-controls);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .radio-strip button:last-child {
    border-right: 0;
  }

  .radio-strip .radio-strip__active {
    color: var(--ink);
    background: color-mix(in srgb, var(--primary) 12%, var(--paper-raised));
  }

  .info-button {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    color: var(--ink-muted);
  }

  .filter-section--completed {
    min-height: 50px;
    gap: 16px;
  }

  .filter-section--completed span {
    gap: 8px;
    font-size: 13px;
  }

  .filter-section--completed span :global(svg) {
    color: var(--primary);
  }

  .reset-button {
    display: flex;
    min-height: 44px;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--fg-amber);
    font-family: var(--font-controls);
    font-size: 10px;
  }

  .reset-button:is(:hover, :focus-visible) {
    background: var(--accent);
    outline: 2px solid var(--fg-amber);
    outline-offset: -4px;
  }

  @media (max-width: 359px) {
    .world-state-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
