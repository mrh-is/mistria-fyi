<script lang="ts">
  import {
    CloudLightning,
    CloudRain,
    CloudSnow,
    Flower,
    Leaf,
    Snowflake,
    Sun,
    SunDim,
    Wind,
  } from "@lucide/svelte";

  import * as Select from "$lib/components/ui/select/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonLabel, weatherLabel, weathersForSeason } from "$lib/utils/format.js";

  import type { Component } from "svelte";

  import type { Season, Weather } from "$lib/types/tracker-data.js";

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];

  const SEASON_ICON: Record<Season, Component<{ class?: string; strokeWidth?: number }>> = {
    fall: Leaf,
    spring: Flower,
    summer: Sun,
    winter: Snowflake,
  };

  let currentSeason = $derived(userState.state.worldState.season);
  let CurrentSeasonIcon = $derived(SEASON_ICON[currentSeason]);
  let CurrentWeatherIcon = $derived(weatherIcon(userState.state.worldState.weather, currentSeason));
  let availableWeathers = $derived(weathersForSeason(currentSeason));

  function weatherIcon(weather: Weather, season: Season): Component<{ class?: string }> {
    if (weather === "calm") return SunDim;
    if (weather === "special") return Wind;
    if (weather === "heavy_inclement") return CloudLightning;
    // inclement: snow in winter, rain otherwise
    if (season === "winter") return CloudSnow;
    return CloudRain;
  }

  // If current weather is not available for this season, reset to calm
  $effect(() => {
    if (!availableWeathers.includes(userState.state.worldState.weather)) {
      userState.setWeather("calm");
    }
  });
</script>

<div class="flex gap-2">
  <Select.Root
    type="single"
    value={userState.state.worldState.season}
    onValueChange={(v) => {
      if (v) userState.setSeason(v as Season);
    }}
  >
    <Select.Trigger class="flex-1">
      <span class="flex items-center gap-1.5">
        <CurrentSeasonIcon
          class="size-4 {currentSeason === 'fall' ? '-scale-y-100 rotate-90' : ''}"
          strokeWidth={currentSeason === "summer" ? 2.5 : undefined}
        />
        {seasonLabel(currentSeason)}
      </span>
    </Select.Trigger>
    <Select.Content>
      {#each seasons as s (s)}
        {@const Icon = SEASON_ICON[s]}
        <Select.Item value={s}>
          <span class="flex items-center gap-1.5">
            <Icon
              class="size-4 {s === 'fall' ? '-scale-y-100 rotate-90' : ''}"
              strokeWidth={s === "summer" ? 2.5 : undefined}
            />
            {seasonLabel(s)}
          </span>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  <Select.Root
    type="single"
    value={userState.state.worldState.weather}
    onValueChange={(v) => {
      if (v) userState.setWeather(v as Weather);
    }}
  >
    <Select.Trigger class="flex-1">
      <span class="flex items-center gap-1.5">
        <CurrentWeatherIcon class="size-4" />
        {weatherLabel(userState.state.worldState.weather, currentSeason)}
      </span>
    </Select.Trigger>
    <Select.Content>
      {#each availableWeathers as w (w)}
        {@const Icon = weatherIcon(w, currentSeason)}
        <Select.Item value={w}>
          <span class="flex items-center gap-1.5">
            <Icon class="size-4" />
            {weatherLabel(w, currentSeason)}
          </span>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
