<script lang="ts">
  import {
    Clock,
    CloudLightning,
    CloudRain,
    CloudSnow,
    Flower,
    Leaf,
    Lock,
    Snowflake,
    Sun,
    SunDim,
    Wind,
  } from "@lucide/svelte";

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

  const SEASON_ICON: Record<Season, typeof Sun> = {
    fall: Leaf,
    spring: Flower,
    summer: Sun,
    winter: Snowflake,
  };

  function weatherIconForRestriction(weather: Weather, seasons: Season[]): typeof Sun {
    if (weather === "calm") return SunDim;
    if (weather === "special") return Wind;
    if (weather === "heavy_inclement") return CloudLightning;
    // inclement: snow if winter-only, rain otherwise
    if (seasons.length === 1 && seasons[0] === "winter") return CloudSnow;
    return CloudRain;
  }

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
        {@const Icon = SEASON_ICON[s]}
        <Icon
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
        {@const Icon = weatherIconForRestriction(w, getSeasonContext())}
        <Icon class="size-3" />
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
        <Clock class="size-2.5" />
        {timeRangeLabel(hours)}
      </span>
    {/if}
  {/each}

  <!-- Fish size (hideable for non-fish categories) -->
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
      <Lock class="size-3 text-muted-foreground" />
    {/each}
  {/if}
</span>
