<script lang="ts">
  import { seasonEmoji, timeRangeLabel, weatherEmoji } from "$lib/utils/format.js";

  import type { Restriction, Season } from "$lib/types/tracker-data.js";

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

  function isAllSeasons(seasons: Season[]): boolean {
    return ALL_SEASONS.every((s) => seasons.includes(s));
  }
</script>

<span class="inline-flex flex-wrap items-center gap-1">
  <!-- Season restrictions -->
  {#each restrictions.filter((r) => r.type === "season" && r.seasons && !isAllSeasons(r.seasons)) as r (JSON.stringify(r))}
    <span class="bg-amber-100 dark:bg-amber-950 inline-flex gap-0.5 rounded px-0.5">
      {#each r.seasons ?? [] as s (s)}
        <span class="text-[10px]" title={s}>{seasonEmoji(s)}</span>
      {/each}
    </span>
  {/each}

  <!-- Weather restrictions -->
  {#each restrictions.filter((r) => r.type === "weather" && r.weathers) as r (JSON.stringify(r))}
    <span class="bg-sky-100 dark:bg-sky-950 inline-flex gap-0.5 rounded px-0.5">
      {#each r.weathers ?? [] as w (w)}
        <span class="text-[10px]" title={w}>{weatherEmoji(w)}</span>
      {/each}
    </span>
  {/each}

  <!-- Time restrictions -->
  {#each restrictions.filter((r) => r.type === "time" && r.hours) as r (JSON.stringify(r))}
    <span class="text-muted-foreground bg-muted rounded px-1 text-[10px]">
      {timeRangeLabel(r.hours as [number, number])}
    </span>
  {/each}

  <!-- Fish size (hideable for non-fish categories) -->
  {#if !hideFishSize}
    {#each restrictions.filter((r) => r.type === "fishSize" && r.size) as r (JSON.stringify(r))}
      <span class="text-muted-foreground bg-muted rounded px-1 text-[10px]">
        {r.size}
      </span>
    {/each}
  {/if}

  <!-- Building/perk locks -->
  {#if !compact}
    {#each restrictions.filter((r) => r.type === "building" || r.type === "perk") as r (JSON.stringify(r))}
      <span class="text-[10px]" title={r.building ?? r.perk ?? ""}>🔒</span>
    {/each}
  {/if}
</span>
