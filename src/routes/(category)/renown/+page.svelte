<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
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

  let currentRankIndex = $derived(Math.min(Math.floor(level / levelsPerRank), ranks.length - 1));
  let levelInRank = $derived(level - currentRankIndex * levelsPerRank);
  let currentRankName = $derived(ranks[currentRankIndex].name);
  let overallPct = $derived(maxLevel > 0 ? (level / maxLevel) * 100 : 0);

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
</script>

<CategoryHeader category={CATEGORY_BY_KEY.renown} {progress} />

<div class="flex flex-col gap-2">
  <div class="text-center text-xl font-semibold">{currentRankName}</div>
  <div class="text-center text-sm text-muted-foreground">
    Level {levelInRank}/{levelsPerRank} in rank
  </div>
  <Progress class="h-2" value={overallPct} />

  <div class="flex items-center justify-center gap-3">
    <Button
      class="size-10 shrink-0"
      size="icon"
      variant="ghost"
      disabled={level <= 0}
      onclick={() => {
        userState.setRenown(level - 1);
      }}
    >
      <Minus class="size-4" />
    </Button>
    {#if editing}
      <Input
        class="h-6 w-20 text-center text-sm"
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
        class="text-base text-muted-foreground hover:underline"
        title="Click to edit level directly"
        type="button"
        onclick={startEditing}
      >
        {level}/{maxLevel} total
      </button>
    {/if}
    <Button
      class="size-10 shrink-0"
      size="icon"
      variant="ghost"
      disabled={level >= maxLevel}
      onclick={() => {
        userState.setRenown(level + 1);
      }}
    >
      <Plus class="size-4" />
    </Button>
  </div>
</div>

<div class="flex flex-col">
  {#each ranks as rank, i (rank.name)}
    {@const isCompleted = level >= (i + 1) * levelsPerRank}
    {@const isCurrent = i === currentRankIndex}
    {#if isCurrent}
      <div class="rounded-md bg-accent px-3 py-2">
        <div class="text-base font-medium">{rank.name}</div>
      </div>
    {:else if isCompleted}
      <div class="px-3 py-0.5 text-sm text-muted-foreground line-through">{rank.name}</div>
    {:else}
      <div class="px-3 py-0.5 text-sm text-muted-foreground">{rank.name}</div>
    {/if}
  {/each}
</div>
