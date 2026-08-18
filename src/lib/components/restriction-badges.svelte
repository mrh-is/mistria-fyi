<script lang="ts">
  import { restrictionWeatherIcon } from "$lib/components/icon/icon-maps.js";
  import { Icon } from "$lib/components/icon/index.js";
  import { timeRangeLabel } from "$lib/utils/format.js";

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

  function isAllWeathers(weathers: Weather[]): boolean {
    return ALL_WEATHERS.every((w) => weathers.includes(w));
  }
</script>

<span class="inline-flex flex-wrap items-center gap-1">
  {#if badges.seasons && !isAllSeasons(badges.seasons)}
    <span
      class="inline-flex gap-0.5 rounded bg-amber-100 px-0.5 py-px text-amber-700 dark:bg-amber-950 dark:text-amber-300"
    >
      {#each badges.seasons as s (s)}
        <Icon.Season season={s} class="size-3" />
      {/each}
    </span>
  {/if}

  {#if badges.weathers && !isAllWeathers(badges.weathers)}
    <span
      class="inline-flex gap-0.5 rounded bg-sky-100 px-0.5 py-px text-sky-700 dark:bg-sky-950 dark:text-sky-300"
    >
      {#each ALL_WEATHERS.filter((w) => (badges.weathers ?? []).includes(w)) as w (w)}
        {@const WeatherComp = restrictionWeatherIcon(w, badges.seasons ?? ALL_SEASONS)}
        <WeatherComp class="size-3" />
      {/each}
    </span>
  {/if}

  {#if badges.timeRange}
    <span
      class="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-px text-sm text-muted-foreground"
    >
      <Icon.Restriction type="clock" class="size-2.5" />
      {timeRangeLabel(badges.timeRange)}
    </span>
  {/if}
</span>
