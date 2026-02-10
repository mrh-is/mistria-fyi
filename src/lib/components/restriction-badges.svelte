<script lang="ts">
  import { Clock, CloudLightning, CloudRain, CloudSun, Flower2, Leaf, Lock, Snowflake, Sparkles, Sun } from "@lucide/svelte";
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
  const ALL_WEATHERS: Weather[] = ["calm", "heavy_inclement", "inclement", "special"];

  const SEASON_ICON: Record<Season, typeof Sun> = {
    spring: Flower2,
    summer: Sun,
    fall: Leaf,
    winter: Snowflake,
  };

  const WEATHER_ICON: Record<Weather, typeof Sun> = {
    calm: CloudSun,
    heavy_inclement: CloudLightning,
    inclement: CloudRain,
    special: Sparkles,
  };

  function isAllSeasons(seasons: Season[]): boolean {
    return ALL_SEASONS.every((s) => seasons.includes(s));
  }

  function isAllWeathers(weathers: Weather[]): boolean {
    return ALL_WEATHERS.every((w) => weathers.includes(w));
  }
</script>

<span class="inline-flex flex-wrap items-center gap-1">
  <!-- Season restrictions -->
  {#each restrictions.filter((r) => r.type === "season" && r.seasons && !isAllSeasons(r.seasons)) as r (JSON.stringify(r))}
    <span class="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 inline-flex gap-0.5 rounded px-0.5 py-px">
      {#each r.seasons ?? [] as s (s)}
        {@const Icon = SEASON_ICON[s]}
        <Icon class="size-3" />
      {/each}
    </span>
  {/each}

  <!-- Weather restrictions (hidden if available in all weathers) -->
  {#each restrictions.filter((r) => r.type === "weather" && r.weathers && !isAllWeathers(r.weathers)) as r (JSON.stringify(r))}
    <span class="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 inline-flex gap-0.5 rounded px-0.5 py-px">
      {#each r.weathers ?? [] as w (w)}
        {@const Icon = WEATHER_ICON[w]}
        <Icon class="size-3" />
      {/each}
    </span>
  {/each}

  <!-- Time restrictions -->
  {#each restrictions.filter((r) => r.type === "time" && r.hours) as r (JSON.stringify(r))}
    <span class="text-muted-foreground bg-muted inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px]">
      <Clock class="size-2.5" />
      {timeRangeLabel(r.hours as [number, number])}
    </span>
  {/each}

  <!-- Fish size (hideable for non-fish categories) -->
  {#if !hideFishSize}
    {#each restrictions.filter((r) => r.type === "fishSize" && r.size) as r (JSON.stringify(r))}
      <span class="text-muted-foreground bg-muted rounded px-1 py-px text-[10px]">
        {r.size}
      </span>
    {/each}
  {/if}

  <!-- Building/perk locks -->
  {#if !compact}
    {#each restrictions.filter((r) => r.type === "building" || r.type === "perk") as r (JSON.stringify(r))}
      <Lock class="text-muted-foreground size-3" />
    {/each}
  {/if}
</span>
