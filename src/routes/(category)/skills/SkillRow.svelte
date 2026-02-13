<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { SkillId } from "$lib/types/tracker-data.js";

  const MAX_LEVEL = 60;
  const TIER_BREAKPOINTS = [1, 15, 30, 45, 60];
  const TIER_NAMES = ["Novice", "Apprentice", "Journeyman", "Expert", "Master"];

  interface Props {
    id: SkillId;
    name: string;
  }

  const { id, name }: Props = $props();

  let level = $derived(userState.state.completed.skillLevels[id as string] ?? 0);
  let maxed = $derived(level >= MAX_LEVEL);
  let tierIdx = $derived.by(() => {
    for (let i = TIER_BREAKPOINTS.length - 1; i >= 0; i--) {
      if (level >= TIER_BREAKPOINTS[i]) return i;
    }
    return -1;
  });

  let editingId = $state<null | string>(null);
  let editValue = $state("");

  function startEditing(skillId: string, skillLevel: number) {
    editingId = skillId;
    editValue = String(skillLevel);
  }

  function commitEdit(skillId: SkillId) {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      userState.setSkillLevel(skillId, parsed);
    }
    editingId = null;
  }

  function handleEditKeydown(e: KeyboardEvent, skillId: SkillId) {
    if (e.key === "Enter") commitEdit(skillId);
    if (e.key === "Escape") editingId = null;
  }
</script>

<div class="flex flex-col gap-1 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
  <div class="flex items-center gap-2">
    <span class="min-w-0 flex-1 text-sm font-medium">{name}</span>
    {#if tierIdx >= 0}
      <span class="text-muted-foreground text-[10px]">{TIER_NAMES[tierIdx]}</span>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <Button
      class="size-8 shrink-0"
      size="icon"
      variant="ghost"
      disabled={level <= 0}
      onclick={() => {
        userState.setSkillLevel(id, level - 1);
      }}
    >
      <Minus class="size-3.5" />
    </Button>

    <div class="relative flex-1">
      <Progress class="h-2" value={(level / MAX_LEVEL) * 100} />
      <!-- Tier markers -->
      <div class="absolute inset-0 flex">
        {#each TIER_BREAKPOINTS.slice(0, -1) as bp (bp)}
          <div
            class="bg-background absolute top-0 h-full w-px"
            style="left: {(bp / MAX_LEVEL) * 100}%"
          ></div>
        {/each}
      </div>
    </div>

    {#if editingId === (id as string)}
      <Input
        class="h-6 w-16 text-center text-xs"
        type="number"
        max={MAX_LEVEL}
        min={0}
        value={editValue}
        onblur={() => {
          commitEdit(id);
        }}
        oninput={(e: Event) => {
          editValue = (e.target as HTMLInputElement).value;
        }}
        onkeydown={(e: KeyboardEvent) => {
          handleEditKeydown(e, id);
        }}
      />
    {:else}
      <button
        class="text-muted-foreground flex h-8 w-12 items-center justify-center text-center text-xs hover:underline"
        type="button"
        onclick={() => {
          startEditing(id as string, level);
        }}
      >
        {level}/{MAX_LEVEL}
      </button>
    {/if}

    <Button
      class="size-8 shrink-0"
      size="icon"
      variant="ghost"
      disabled={level >= MAX_LEVEL}
      onclick={() => {
        userState.setSkillLevel(id, level + 1);
      }}
    >
      <Plus class="size-3.5" />
    </Button>
  </div>
</div>
