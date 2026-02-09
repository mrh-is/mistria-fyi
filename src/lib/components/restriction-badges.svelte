<script lang="ts">
  import { seasonEmoji, timeRangeLabel, weatherEmoji } from "$lib/utils/format.js";

  import type { Restriction } from "$lib/types/tracker-data.js";

  let { restrictions }: { restrictions: Restriction[] } = $props();
</script>

<span class="inline-flex flex-wrap gap-0.5">
  {#each restrictions as r (JSON.stringify(r))}
    {#if r.type === "season" && r.seasons}
      {#each r.seasons as s (s)}
        <span class="text-[10px]" title={s}>{seasonEmoji(s)}</span>
      {/each}
    {:else if r.type === "weather" && r.weathers}
      {#each r.weathers as w (w)}
        <span class="text-[10px]" title={w}>{weatherEmoji(w)}</span>
      {/each}
    {:else if r.type === "time" && r.hours}
      <span class="text-muted-foreground bg-muted rounded px-1 text-[10px]">
        {timeRangeLabel(r.hours)}
      </span>
    {:else if r.type === "fishSize" && r.size}
      <span class="text-muted-foreground bg-muted rounded px-1 text-[10px]">
        {r.size}
      </span>
    {:else if r.type === "building" || r.type === "perk"}
      <span class="text-[10px]" title={r.building ?? r.perk ?? ""}>🔒</span>
    {/if}
  {/each}
</span>
