<script lang="ts">
  import { Check, Crown, Minus, Plus } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getRenownProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getRenownProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let level = $derived(userState.state.completed.renown);
  let levelsPerRank = trackerData.renown.levelsPerRank;
  let ranks = trackerData.renown.ranks;
  let maxLevel = levelsPerRank * ranks.length;

  let editing = $state(false);
  let editValue = $state("");

  function startEditing() {
    editValue = String(level);
    editing = true;
  }

  function commitEdit() {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      userState.setRenown(parsed);
    }
    editing = false;
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") editing = false;
  }

  function rankLevelsCompleted(rankIndex: number): number {
    const rankStart = rankIndex * levelsPerRank;
    return Math.max(0, Math.min(levelsPerRank, level - rankStart));
  }
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={Crown} name="Renown" {progress} />

  <div class="flex items-center justify-center gap-3">
    <Button
      class="size-6 shrink-0"
      size="icon"
      variant="ghost"
      disabled={level <= 0}
      onclick={() => {
        userState.setRenown(level - 1);
      }}
    >
      <Minus class="size-3" />
    </Button>
    {#if editing}
      <Input
        class="h-6 w-20 text-center text-xs"
        type="number"
        max={maxLevel}
        min={0}
        value={editValue}
        onblur={commitEdit}
        oninput={(e: Event) => {
          editValue = (e.target as HTMLInputElement).value;
        }}
        onkeydown={handleEditKeydown}
      />
    {:else}
      <button
        class="text-muted-foreground text-sm hover:underline"
        title="Click to edit level directly"
        type="button"
        onclick={startEditing}
      >
        {level}/{maxLevel} total
      </button>
    {/if}
    <Button
      class="size-6 shrink-0"
      size="icon"
      variant="ghost"
      disabled={level >= maxLevel}
      onclick={() => {
        userState.setRenown(level + 1);
      }}
    >
      <Plus class="size-3" />
    </Button>
  </div>

  <div class="flex flex-col gap-3">
    {#each ranks as rank, i (rank.name)}
      {@const completed = rankLevelsCompleted(i)}
      {@const maxed = completed >= levelsPerRank}
      {#if maxed ? userState.state.showCompleted : true}
        <div class="flex flex-col gap-1 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 text-sm font-medium">{rank.name}</span>
            {#if maxed}
              <Check class="text-muted-foreground size-3.5" />
            {/if}
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <Progress class="h-2" value={(completed / levelsPerRank) * 100} />
            </div>
            <span class="text-muted-foreground w-12 text-center text-xs">
              {completed}/{levelsPerRank}
            </span>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
