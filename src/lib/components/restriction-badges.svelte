<script lang="ts">
  import { restrictionWeatherIcon } from "$lib/components/icon/icon-maps.js";
  import { Icon } from "$lib/components/icon/index.js";
  import { timeRangeLabel } from "$lib/utils/format.js";

  import type { Restriction, Season, Weather } from "$lib/types/tracker-data.js";

  let {
    compact = false,
    hideFishSize = false,
    restrictions,
  }: {
    compact?: boolean;
    hideFishSize?: boolean;
    restrictions: Restriction[];
  } = $props();

  const ALL_SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
  const ALL_WEATHERS: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];

  function isAllSeasons(seasons: Season[]): boolean {
    return ALL_SEASONS.every((s) => seasons.includes(s));
  }

  function isAllWeathers(weathers: Weather[]): boolean {
    return ALL_WEATHERS.every((w) => weathers.includes(w));
  }

  /** Get the season context from the restrictions (for weather icon selection) */
  function getSeasonContext(): Season[] {
    for (const r of restrictions) {
      if (r.type === "season" && r.seasons) return r.seasons;
    }
    return ALL_SEASONS;
  }
</script>

<span class="inline-flex flex-wrap items-center gap-1">
  <!-- Season restrictions -->
  {#each restrictions.filter((r) => r.type === "season" && r.seasons && !isAllSeasons(r.seasons)) as r (JSON.stringify(r))}
    <span
      class="inline-flex gap-0.5 rounded bg-amber-100 px-0.5 py-px text-amber-700 dark:bg-amber-950 dark:text-amber-300"
    >
      {#each r.seasons ?? [] as s (s)}
        <Icon.Season
          season={s}
          class="size-3 {s === 'fall' ? '-scale-y-100 rotate-90' : ''}"
          strokeWidth={s === "summer" ? 2.5 : undefined}
        />
      {/each}
    </span>
  {/each}

  <!-- Weather restrictions (hidden if available in all weathers) -->
  {#each restrictions.filter((r) => r.type === "weather" && r.weathers && !isAllWeathers(r.weathers)) as r (JSON.stringify(r))}
    <span
      class="inline-flex gap-0.5 rounded bg-sky-100 px-0.5 py-px text-sky-700 dark:bg-sky-950 dark:text-sky-300"
    >
      {#each ALL_WEATHERS.filter((w) => (r.weathers ?? []).includes(w)) as w (w)}
        {@const WeatherComp = restrictionWeatherIcon(w, getSeasonContext())}
        <WeatherComp class="size-3" />
      {/each}
    </span>
  {/each}

  <!-- Time restrictions -->
  {#each restrictions.filter((r) => r.type === "time" && r.hours) as r (JSON.stringify(r))}
    {@const hours = r.hours}
    {#if hours}
      <span
        class="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-px text-sm text-muted-foreground"
      >
        <Icon.Restriction type="clock" class="size-2.5" />
        {timeRangeLabel(hours)}
      </span>
    {/if}
  {/each}

  <!-- Fish size (hide-able for non-fish categories) -->
  {#if !hideFishSize}
    {#each restrictions.filter((r) => r.type === "fishSize" && r.size) as r (JSON.stringify(r))}
      <span class="rounded bg-muted px-1 py-px text-sm text-muted-foreground">
        {r.size}
      </span>
    {/each}
  {/if}

  <!-- Building/perk locks -->
  {#if !compact}
    {#each restrictions.filter((r) => r.type === "building" || r.type === "perk") as r (JSON.stringify(r))}
      <Icon.Restriction type="lock" class="size-3 text-muted-foreground" />
    {/each}
  {/if}
</span>
