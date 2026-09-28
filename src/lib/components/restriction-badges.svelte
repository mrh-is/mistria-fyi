<script lang="ts">
  import { page } from "$app/state";
  import { restrictionWeatherIcon } from "$lib/components/icon/icon-maps.js";
  import { Icon } from "$lib/components/icon/index.js";
  import { weathersForSeason } from "$lib/engine/world-state";
  import { seasonLabel, timeRangeLabel, weatherLabel } from "$lib/utils/format.js";

  import type { AppIcon } from "$lib/components/icon/icon-maps.js";
  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  let {
    badges,
  }: {
    badges: DisplayBadges;
  } = $props();

  const ALL_SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
  const ALL_WEATHERS: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];

  type Chip =
    | { icons: AppIcon[]; kind: "weathers"; label: string }
    | { kind: "seasons"; label: string; seasons: Season[] }
    | { kind: "time"; label: string };

  function isAllSeasons(seasons: Season[]): boolean {
    return ALL_SEASONS.every((s) => seasons.includes(s));
  }

  function isAllWeathers(weathers: Weather[], seasons?: Season[]): boolean {
    const availableWeathers = seasons?.length
      ? [...new Set(seasons.flatMap(weathersForSeason))]
      : ALL_WEATHERS;
    return availableWeathers.every((weather) => weathers.includes(weather));
  }

  let chips: Chip[] = $derived.by(() => {
    const result: Chip[] = [];

    if (badges.seasons && !isAllSeasons(badges.seasons)) {
      result.push({
        kind: "seasons",
        label: badges.seasons.map((season) => seasonLabel(season, page.data.locale)).join(", "),
        seasons: badges.seasons,
      });
    }

    if (badges.weathers && !isAllWeathers(badges.weathers, badges.seasons)) {
      const seasons = badges.seasons ?? [];
      const weathers = ALL_WEATHERS.filter((w) => badges.weathers?.includes(w));
      result.push({
        icons: weathers.map((w) => restrictionWeatherIcon(w, seasons)),
        kind: "weathers",
        label: weathers
          .map((w) => weatherLabel(w, badges.seasons?.length === 1 ? badges.seasons[0] : undefined))
          .join(", "),
      });
    }

    if (badges.timeRange) {
      result.push({ kind: "time", label: timeRangeLabel(badges.timeRange) });
    }

    return result;
  });
</script>

<span class="restriction-badges">
  {#each chips as chip (chip.kind)}
    {#if chip.kind === "seasons"}
      <span class="restriction-chip" title={chip.label}>
        <span class="restriction-chip__label">{chip.label}</span>
        {#each chip.seasons as season (season)}
          <span class="restriction-chip__season" data-season={season} aria-hidden="true">
            <Icon.Season {season} size={14} stroke={2} />
          </span>
        {/each}
      </span>
    {:else if chip.kind === "weathers"}
      <span class="restriction-chip restriction-chip--neutral" title={chip.label}>
        <span class="restriction-chip__label">{chip.label}</span>
        <span class="restriction-chip__icons" aria-hidden="true">
          {#each chip.icons as WeatherIcon (WeatherIcon)}
            <WeatherIcon size={14} stroke={2} />
          {/each}
        </span>
      </span>
    {:else}
      <span class="restriction-chip restriction-chip--neutral" title={chip.label}>
        <span class="restriction-chip__label">{chip.label}</span>
        <span aria-hidden="true"><Icon.Restriction type="clock" size={14} stroke={2} /></span>
      </span>
    {/if}
  {/each}
</span>

<style>
  .restriction-badges {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
  }

  .restriction-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 1px;
    height: 22px;
    padding: 0 4px;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--hairline) 18%, transparent);
    color: var(--ink-muted);
  }

  .restriction-chip--neutral {
    color: color-mix(in srgb, var(--ink-muted) 78%, transparent);
  }

  .restriction-chip__season {
    display: inline-flex;
    line-height: 0;
  }

  .restriction-chip__icons {
    display: inline-flex;
    gap: 1px;
  }

  .restriction-chip__label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .restriction-chip__season[data-season="spring"] {
    color: var(--fg-green);
  }

  .restriction-chip__season[data-season="summer"] {
    color: var(--fg-amber);
  }

  .restriction-chip__season[data-season="fall"] {
    color: var(--fg-brown);
  }

  .restriction-chip__season[data-season="winter"] {
    color: var(--fg-blue);
  }
</style>
