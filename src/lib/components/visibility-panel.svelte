<script lang="ts">
  import { IconClock, IconInfoCircle, IconSquareX, IconTags } from "@tabler/icons-svelte-runes";
  import { prefersReducedMotion } from "svelte/motion";

  import { page } from "$app/state";
  import BlockySwitch from "$lib/components/blocky-switch.svelte";
  import { weatherIcon } from "$lib/components/icon/icon-maps.js";
  import { Icon } from "$lib/components/icon/index.js";
  import SourceExplainerDialog from "$lib/components/source-explainer-dialog.svelte";
  import * as m from "$lib/paraglide/messages.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { AVAILABILITY_WINDOWS } from "$lib/types/availability.js";
  import {
    seasonLabel,
    seasonLabelAbbr,
    weatherLabel,
    weathersForSeason,
  } from "$lib/utils/format.js";

  import type { Icon as AppIcon } from "@tabler/icons-svelte-runes";

  import type { AvailabilityWindow } from "$lib/types/availability.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  let { showSeasonality }: { showSeasonality: boolean } = $props();

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const allWeathers: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];
  const TRANSITION_MS = 180;
  const availabilityLabels: Record<AvailabilityWindow, string> = {
    anytime: m.availability_anytime(),
    later: m.availability_later(),
    now: m.availability_now(),
  };

  let sourcesExplainerOpen = $state(false);
  let currentSeason = $derived(userState.state.worldState.season);
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

  function transitionDuration(): number {
    return prefersReducedMotion.current ? 0 : TRANSITION_MS;
  }

  let weatherSlotDisplay = $state(buildWeatherSlots(userState.state.worldState.season));
  let weatherSlotFading = $state(
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
  }

  $effect(() => {
    if (!availableWeathers.includes(userState.state.worldState.weather)) {
      userState.setWeather("calm");
    }
  });
</script>

<SourceExplainerDialog bind:open={sourcesExplainerOpen} filters={toolbarState.sourceFilters} />

<div class="filters">
  {#if showSeasonality}
    <section class="filter-section" aria-labelledby="availability-filter-label">
      <h3 id="availability-filter-label">
        <IconClock class="size-3.5" />{m.visibility_when_to_find()}
      </h3>
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
          <div class="radio-strip" aria-label={m.visibility_season_label()}>
            {#each seasons as season (season)}
              {@const selected = season === currentSeason}
              <button
                type="button"
                aria-label={seasonLabel(season, page.data.locale)}
                aria-pressed={selected}
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
                  aria-label={weatherLabel(weather, currentSeason)}
                  aria-pressed={selected}
                  aria-hidden={isSpecial && !hasSpecialWeather}
                  class:radio-strip__active={selected}
                  disabled={isSpecial && !hasSpecialWeather}
                  tabindex={isSpecial && !hasSpecialWeather ? -1 : undefined}
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
                    {weatherSlotDisplay[weather].label.replace(" weather", "")}
                  </span>
                </button>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>
  {/if}

  {#if toolbarState.sourceFilters.length > 0}
    <section class="filter-section" aria-labelledby="source-filter-label">
      <div class="filter-section__heading">
        <h3 id="source-filter-label"><IconTags class="size-3.5" />{m.visibility_source_types()}</h3>
        <button
          class="info-button"
          type="button"
          aria-label={m.visibility_source_types_about_aria()}
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

  <section
    class="filter-section filter-section--completed"
    aria-label={m.visibility_completion_aria()}
  >
    <span><IconSquareX class="size-3.5" />{m.visibility_show_completed()}</span>
    <BlockySwitch
      label={m.visibility_show_completed()}
      checked={userState.state.showCompleted}
      onCheckedChange={() => {
        userState.toggleShowCompleted();
      }}
    />
  </section>
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
    font-size: var(--text-2xs);
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
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 10px;
    border: 1px solid color-mix(in srgb, var(--hairline) 34%, transparent);
    color: var(--ink-muted);
    background: var(--paper-deep);
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
    background: color-mix(in srgb, var(--primary) 14%, var(--paper-raised));
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
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-3xs);
  }

  .radio-strip {
    display: flex;
    min-width: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--hairline) 34%, transparent);
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
    border-right: 1px solid color-mix(in srgb, var(--hairline) 28%, transparent);
    color: var(--ink-muted);
    background: var(--paper-deep);
    font-family: var(--font-controls);
    font-size: var(--text-4xs);
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
    gap: 6px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  @media (max-width: 479px) {
    .world-state-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .radio-strip button,
    .radio-strip__content,
    .radio-strip--weather {
      transition-duration: 0.01ms !important;
    }
  }
</style>
