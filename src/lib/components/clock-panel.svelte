<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import { weatherIcon } from "#lib/components/icon/icon-maps.js";
  import { Icon } from "#lib/components/icon/index.js";
  import SegmentedPicker from "#lib/components/segmented-picker.svelte";
  import { weathersForSeason } from "#lib/engine/world-state.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { seasonLabel, weatherLabel } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { Icon as AppIcon } from "@tabler/icons-svelte-runes";

  import type { Season, Weather } from "#lib/types/tracker-data.js";

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const allWeathers: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];
  const TRANSITION_MS = 180;

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
</script>

<div class="clock-panel">
  <div class="world-state-grid">
    <div>
      <p>Season</p>
      <SegmentedPicker
        label="Season"
        choices={seasons}
        value={currentSeason}
        labelFor={(season) => seasonLabel(season, page.data.locale)}
        onSelect={(season) => userState.setSeason(season)}
      >
        {#snippet content(season)}
          <Icon.Season {season} class="size-3" />{seasonLabel(season, page.data.locale)}
        {/snippet}
      </SegmentedPicker>
    </div>

    <div>
      <p>Weather</p>
      <SegmentedPicker
        label="Weather"
        choices={allWeathers}
        value={userState.state.worldState.weather}
        labelFor={(weather) => weatherLabel(weather, currentSeason)}
        hiddenChoice={hasSpecialWeather ? undefined : "special"}
        columns={weatherColumns}
        duration={transitionDuration()}
        onSelect={(weather) => userState.setWeather(weather)}
      >
        {#snippet content(weather)}
          {@const SlotIcon = weatherSlotDisplay[weather].icon}
          <span
            class="weather-content"
            style:opacity={weatherSlotFading[weather] ? 0 : 1}
            style:transition-duration="{transitionDuration() / 2}ms"
          >
            <SlotIcon class="size-3" />
            {weatherSlotDisplay[weather].label}
          </span>
        {/snippet}
      </SegmentedPicker>
    </div>
  </div>
</div>

<style>
  /*
   * Season over weather, each a section ruled off like the filter panel's, with its label set as a
   * small-caps head. The panel is narrow wherever it opens, so the two never sit side by side.
   */
  .world-state-grid {
    display: grid;
  }

  .world-state-grid > div {
    padding: 11px 18px 14px;
  }

  .world-state-grid > div + div {
    border-top: 1px solid color-mix(in srgb, var(--color-ink-hairline) 28%, transparent);
  }

  .world-state-grid p {
    margin-bottom: 7px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /*
   * The choices are cards in a tray: the tray is sunken, and the chosen card sits up on it in the
   * page's raised paper with a strip of the page's color along its foot, like a pulled index card.
   */
  .world-state-grid :global(.strip) {
    gap: 3px;
    padding: 3px;
    border-radius: var(--radius);
    background: var(--color-paper-sunken);
  }

  .world-state-grid :global(.segment) {
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    font-size: var(--text-2xs);
  }

  .world-state-grid :global(.segment[aria-checked="true"]) {
    border-color: var(--color-rule);
    border-block-end: 2px solid var(--primary);
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-small);
  }

  .world-state-grid :global(.segment:not([aria-checked="true"]):hover) {
    color: var(--color-ink);
  }

  /* Four whole season names don't fit a narrow phone in a row, so they make a 2 × 2. */
  @media (max-width: 22rem) {
    .world-state-grid :global(.strip:not(.slotted)) {
      flex-wrap: wrap;
    }

    .world-state-grid :global(.strip:not(.slotted) .segment) {
      flex: 1 1 40%;
    }
  }

  .weather-content {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 3px;
    transition-property: opacity;
    transition-timing-function: ease-out;
  }
</style>
