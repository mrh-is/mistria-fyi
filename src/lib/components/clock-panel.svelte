<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import { weatherIcon } from "#lib/components/icon/icon-maps.js";
  import { Icon } from "#lib/components/icon/index.js";
  import SegmentedPicker from "#lib/components/segmented-picker.svelte";
  import { weathersForSeason } from "#lib/engine/world-state.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { seasonLabel, seasonLabelAbbr, weatherLabel } from "#lib/utils/format.js";
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
          <Icon.Season {season} class="size-3" />{seasonLabelAbbr(season)}
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
  .clock-panel {
    padding: 11px 18px;
  }

  .world-state-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
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

  .weather-content {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 3px;
    transition-property: opacity;
    transition-timing-function: ease-out;
  }

  @media (max-width: 479px) {
    .world-state-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
