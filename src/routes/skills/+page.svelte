<script lang="ts">
  import { BookOpenText, Minus, Plus } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getSkillsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { SkillId } from "$lib/types/tracker-data.js";

  const TIER_BREAKPOINTS = [1, 15, 30, 45, 60];
  const TIER_NAMES = ["Novice", "Apprentice", "Journeyman", "Expert", "Master"];

  let progress = $derived(
    getSkillsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let skills = $derived(
    Object.entries(trackerData.skills)
      .map(([id, name]) => ({ id: id as SkillId, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  function getLevel(id: SkillId): number {
    return userState.state.completed.skillLevels[id as string] ?? 0;
  }

  function getTierIndex(level: number): number {
    for (let i = TIER_BREAKPOINTS.length - 1; i >= 0; i--) {
      if (level >= TIER_BREAKPOINTS[i]) return i;
    }
    return -1; // below tier 1
  }

  let editingId = $state<null | string>(null);
  let editValue = $state("");

  function startEditing(id: string, level: number) {
    editingId = id;
    editValue = String(level);
  }

  function commitEdit(id: SkillId) {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      userState.setSkillLevel(id, parsed);
    }
    editingId = null;
  }

  function handleEditKeydown(e: KeyboardEvent, id: SkillId) {
    if (e.key === "Enter") commitEdit(id);
    if (e.key === "Escape") editingId = null;
  }
</script>

<div class="flex flex-col gap-4 px-4 pb-4">
  <CategoryHeader icon={BookOpenText} name="Skills" {progress} />

  <div class="flex flex-col gap-3">
    {#each skills as skill (skill.id)}
      {@const level = getLevel(skill.id)}
      {@const maxed = level >= 60}
      {@const tierIdx = getTierIndex(level)}
      {#if maxed ? userState.state.showCompleted : true}
        <div class="flex flex-col gap-1 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 text-sm font-medium">{skill.name}</span>
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
                userState.setSkillLevel(skill.id, level - 1);
              }}
            >
              <Minus class="size-3.5" />
            </Button>

            <div class="relative flex-1">
              <Progress class="h-2" value={(level / 60) * 100} />
              <!-- Tier markers -->
              <div class="absolute inset-0 flex">
                {#each TIER_BREAKPOINTS.slice(0, -1) as bp (bp)}
                  <div
                    class="bg-background absolute top-0 h-full w-px"
                    style="left: {(bp / 60) * 100}%"
                  ></div>
                {/each}
              </div>
            </div>

            {#if editingId === (skill.id as string)}
              <Input
                class="h-6 w-16 text-center text-xs"
                type="number"
                max={60}
                min={0}
                value={editValue}
                onblur={() => {
                  commitEdit(skill.id);
                }}
                oninput={(e: Event) => {
                  editValue = (e.target as HTMLInputElement).value;
                }}
                onkeydown={(e: KeyboardEvent) => {
                  handleEditKeydown(e, skill.id);
                }}
              />
            {:else}
              <button
                class="text-muted-foreground flex h-8 w-12 items-center justify-center text-center text-xs hover:underline"
                type="button"
                onclick={() => {
                  startEditing(skill.id as string, level);
                }}
              >
                {level}/60
              </button>
            {/if}

            <Button
              class="size-8 shrink-0"
              size="icon"
              variant="ghost"
              disabled={level >= 60}
              onclick={() => {
                userState.setSkillLevel(skill.id, level + 1);
              }}
            >
              <Plus class="size-3.5" />
            </Button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
