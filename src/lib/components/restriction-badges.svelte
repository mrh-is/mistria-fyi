<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import {
    seasonLabel,
    timeRangeLabel,
    weatherLabel,
    weathersForSeason,
  } from "$lib/utils/format.js";

  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  let {
    badges,
  }: {
    badges: DisplayBadges;
  } = $props();

  const ALL_SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
  const ALL_WEATHERS: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];

  function isAllSeasons(seasons: Season[]): boolean {
    return ALL_SEASONS.every((s) => seasons.includes(s));
  }

  function isAllWeathers(weathers: Weather[], seasons?: Season[]): boolean {
    const availableWeathers = seasons?.length
      ? [...new Set(seasons.flatMap(weathersForSeason))]
      : ALL_WEATHERS;
    return availableWeathers.every((weather) => weathers.includes(weather));
  }
</script>

<span class="restriction-badges">
  {#if badges.seasons}
    {#if isAllSeasons(badges.seasons)}
      <span class="restriction-badge restriction-badge--neutral">Any season</span>
    {:else}
      {#each badges.seasons as season (season)}
        <span class="restriction-badge" data-season={season}>{seasonLabel(season)}</span>
      {/each}
    {/if}
  {/if}

  {#if badges.weathers}
    {#if isAllWeathers(badges.weathers, badges.seasons)}
      <span class="restriction-badge restriction-badge--neutral">Any weather</span>
    {:else}
      {#each ALL_WEATHERS.filter( (weather) => badges.weathers?.includes(weather) ) as weather (weather)}
        <span class="restriction-badge restriction-badge--neutral">
          {weatherLabel(weather, badges.seasons?.length === 1 ? badges.seasons[0] : undefined)}
        </span>
      {/each}
    {/if}
  {:else if badges.seasons}
    <span class="restriction-badge restriction-badge--neutral">Any weather</span>
  {/if}

  {#if badges.timeRange}
    <span class="restriction-badge restriction-badge--neutral restriction-badge--time">
      <Icon.Restriction type="clock" class="restriction-badge__icon" />
      {timeRangeLabel(badges.timeRange)}
    </span>
  {/if}
</span>

<style>
  .restriction-badges {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 12px;
    font-family: var(--font-data);
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .restriction-badge {
    color: var(--fg-amber);
    white-space: nowrap;
  }

  .restriction-badge[data-season="spring"] {
    color: var(--fg-green);
  }

  .restriction-badge[data-season="fall"] {
    color: var(--fg-brown);
  }

  .restriction-badge[data-season="winter"] {
    color: var(--fg-blue);
  }

  .restriction-badge--neutral {
    color: color-mix(in srgb, var(--ink-muted) 78%, transparent);
  }

  .restriction-badge--time {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  :global(.restriction-badge__icon) {
    width: 0.75rem;
    height: 0.75rem;
  }
</style>
