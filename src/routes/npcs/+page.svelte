<script lang="ts">
  import { Heart } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getNpcsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonEmoji } from "$lib/utils/format.js";

  import type { NpcId } from "$lib/types/tracker-data.js";

  let progress = $derived(
    getNpcsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let npcs = $derived(
    Object.entries(trackerData.npcs)
      .map(([id, npc]) => ({ ...npc, id: id as NpcId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={Heart} name="NPCs" {progress} />

  <div class="flex flex-col">
    {#each npcs as npc (npc.id)}
      {@const completed = userState.state.completed.npcs.has(npc.id)}
      {#if completed ? userState.state.showCompleted : true}
        <div
          class="flex items-center gap-2 rounded-md px-2 py-1 {completed
            ? 'line-through opacity-40'
            : ''}"
        >
          <Checkbox
            checked={completed}
            onCheckedChange={() => {
              userState.toggleNpc(npc.id);
            }}
          />
          <span class="min-w-0 flex-1 text-sm">{npc.name}</span>
          {#if npc.dateable}
            <span class="text-[10px]" title="Dateable">💕</span>
          {/if}
          <span class="text-muted-foreground text-[10px]">
            {seasonEmoji(npc.birthday.season)}
            {npc.birthday.day}
          </span>
        </div>
      {/if}
    {/each}
  </div>
</div>
