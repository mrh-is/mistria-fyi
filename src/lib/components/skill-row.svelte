<script lang="ts">
  import { page } from "$app/state";
  import Stepper from "$lib/components/stepper.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordKeys } from "$lib/utils";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import type { SkillId } from "$lib/types/tracker-data.js";

  const MAX_LEVEL = 60;
  const SEGMENTS = [
    { start: 0, end: 15 },
    { start: 15, end: 30 },
    { start: 30, end: 45 },
    { start: 45, end: 60 },
  ];

  interface Props {
    id: SkillId;
    name: string;
  }

  const { id, name }: Props = $props();

  let feedbackContext = getFeedbackContextOrFallback();
  let level = $derived(userState.state.completed.skillLevels[id] ?? 0);
  let reportable = $derived(
    feedbackContext.reportable({
      category: "skill",
      displayName: name,
      entityId: id,
      extra: { level },
      page: page.url.pathname,
    }),
  );
  let maxed = $derived(level >= MAX_LEVEL);
  let currentSegment = $derived(SEGMENTS.findLastIndex((s) => level >= s.start && level > 0));

  function segmentFill(seg: { start: number; end: number }): number {
    if (level <= seg.start) return 0;
    if (level >= seg.end) return 100;
    return ((level - seg.start) / (seg.end - seg.start)) * 100;
  }

  function segmentOpacity(segIdx: number): number {
    if (currentSegment < 0) return 0.25;
    if (segIdx > currentSegment) return 0.25;
    if (segIdx === currentSegment) return 1;
    const distance = currentSegment - segIdx;
    return Math.max(0.35, 1 - distance * 0.2);
  }

  let editingId = $state<SkillId | undefined>(undefined);
  let editValue = $state("");
  let editInputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (editInputRef) {
      editInputRef.focus();
      editInputRef.select();
    }
  });

  function startEditing(skillId: SkillId, skillLevel: number) {
    editingId = skillId;
    editValue = String(skillLevel);
  }

  function commitEdit(skillId: SkillId) {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      setLevelWithCelebration(skillId, parsed);
    }
    editingId = undefined;
  }

  function handleEditKeydown(e: KeyboardEvent, skillId: SkillId) {
    if (e.key === "Enter") commitEdit(skillId);
    if (e.key === "Escape") editingId = undefined;
  }

  function areAllSkillsMaxed(): boolean {
    return recordKeys(trackerData.skills).every(
      (sid) => (userState.state.completed.skillLevels[sid] ?? 0) >= MAX_LEVEL,
    );
  }

  function setLevelWithCelebration(skillId: SkillId, newLevel: number): void {
    const wasDone = areAllSkillsMaxed();
    userState.setSkillLevel(skillId, newLevel);
    if (!wasDone && areAllSkillsMaxed()) {
      celebrateCategory();
    }
  }
</script>

<div
  class="flex flex-col gap-1 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}"
  {@attach reportable}
>
  <span class="text-base font-medium">{name}</span>

  <Stepper
    decrementDisabled={level <= 0}
    incrementDisabled={level >= MAX_LEVEL}
    decrementLabel="Decrease {name} level"
    incrementLabel="Increase {name} level"
    label="{name} level"
    value="{level} of {MAX_LEVEL}"
    onDecrement={() => {
      setLevelWithCelebration(id, level - 1);
    }}
    onIncrement={() => {
      setLevelWithCelebration(id, level + 1);
    }}
  >
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <div class="flex min-w-0 flex-1 gap-0.5">
        {#each SEGMENTS as seg, i (seg.start)}
          <div
            class="h-2 flex-1 overflow-hidden bg-primary/15 {i === 0 ? 'rounded-l-full' : ''} {i ===
            SEGMENTS.length - 1
              ? 'rounded-r-full'
              : ''}"
            style="opacity: {segmentOpacity(i)}"
          >
            <div
              class="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style="width: {segmentFill(seg)}%"
            ></div>
          </div>
        {/each}
      </div>

      {#if editingId === id}
        <Input
          aria-label="{name} level"
          bind:ref={editInputRef}
          class="h-6 w-16 shrink-0 text-center text-sm"
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
          class="flex min-h-11 min-w-11 shrink-0 items-center justify-end text-sm text-muted-foreground hover:underline"
          type="button"
          aria-label="Edit {name} level, currently {level} of {MAX_LEVEL}"
          onclick={() => {
            startEditing(id, level);
          }}
        >
          {level}/{MAX_LEVEL}
        </button>
      {/if}
    </div>
  </Stepper>
</div>
