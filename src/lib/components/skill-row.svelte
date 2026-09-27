<script lang="ts">
  import { page } from "$app/state";
  import IconCompletion from "$lib/components/icon/icon-completion.svelte";
  import Stepper from "$lib/components/stepper.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { MAX_SKILL_LEVEL } from "$lib/engine/progress.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import * as m from "$lib/paraglide/messages.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordKeys } from "$lib/utils";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import type { SkillId } from "$lib/types/tracker-data.js";

  const SEGMENTS = [
    { start: 0, end: 15 },
    { start: 15, end: 30 },
    { start: 30, end: 45 },
    { start: 45, end: 60 },
  ];

  let { compact = false, id, name }: { compact?: boolean; id: SkillId; name: string } = $props();

  let feedbackContext = getFeedbackContextOrFallback();
  let level = $derived(userState.state.completed.skillLevels[id] ?? 0);
  let maxed = $derived(level >= MAX_SKILL_LEVEL);
  let reportable = $derived(
    feedbackContext.reportable({
      category: "skill",
      displayName: name,
      entityId: id,
      extra: { level },
      page: page.url.pathname,
    }),
  );
  let editing = $state(false);
  let editValue = $state("");
  let editInputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (editInputRef) {
      editInputRef.focus();
      editInputRef.select();
    }
  });

  function areAllSkillsMaxed(): boolean {
    return recordKeys(trackerData.skills).every(
      (skillId) => (userState.state.completed.skillLevels[skillId] ?? 0) >= MAX_SKILL_LEVEL,
    );
  }

  function commitEdit(): void {
    const value = Number(editValue);
    if (editValue.trim() !== "" && Number.isFinite(value) && Number.isInteger(value)) {
      setLevelWithCelebration(value);
    }
    editing = false;
  }

  function handleEditKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") commitEdit();
    if (event.key === "Escape") editing = false;
  }

  function segmentFill(segment: { start: number; end: number }): number {
    if (level <= segment.start) return 0;
    if (level >= segment.end) return 100;
    return ((level - segment.start) / (segment.end - segment.start)) * 100;
  }

  function setLevelWithCelebration(newLevel: number): void {
    const wasDone = areAllSkillsMaxed();
    userState.setSkillLevel(id, newLevel);
    if (!wasDone && areAllSkillsMaxed()) celebrateCategory();
  }

  function startEditing(): void {
    editing = true;
    editValue = String(level);
  }
</script>

<li
  class="skill-record"
  data-skill-record
  data-compact={compact}
  data-complete={maxed}
  {@attach reportable}
>
  <span class="skill-name">
    {#if maxed}
      <span data-testid="skill-completion-mark">
        <IconCompletion state="completed" class="skill-completion-mark" />
      </span>
    {/if}
    <strong>{name}</strong>
  </span>

  <Stepper
    decrementDisabled={level <= 0}
    incrementDisabled={level >= MAX_SKILL_LEVEL}
    decrementLabel={m.skill_decrease_level({ name })}
    incrementLabel={m.skill_increase_level({ name })}
    label={m.skill_level_label({ name })}
    value={m.stepper_level_progress({ level, max: MAX_SKILL_LEVEL })}
    onDecrement={() => {
      setLevelWithCelebration(level - 1);
    }}
    onIncrement={() => {
      setLevelWithCelebration(level + 1);
    }}
  >
    <div class="skill-meter">
      <span class="skill-segments" data-testid="skill-segments" aria-hidden="true">
        {#each SEGMENTS as segment (segment.start)}
          <span data-skill-segment>
            <i style="width: {segmentFill(segment)}%"></i>
          </span>
        {/each}
      </span>

      {#if editing}
        <Input
          aria-label={m.skill_level_label({ name })}
          bind:ref={editInputRef}
          class="h-8 w-16 shrink-0 text-center font-mono text-xs"
          type="number"
          max={MAX_SKILL_LEVEL}
          min={0}
          value={editValue}
          onblur={commitEdit}
          oninput={(event: Event) => {
            editValue = (event.target as HTMLInputElement).value;
          }}
          onkeydown={handleEditKeydown}
        />
      {:else}
        <button
          class="skill-count"
          type="button"
          aria-label={m.skill_edit_level_aria({ level, max: MAX_SKILL_LEVEL, name })}
          onclick={startEditing}
        >
          {level} / {MAX_SKILL_LEVEL}
        </button>
      {/if}
    </div>
  </Stepper>
</li>

<style>
  .skill-record {
    display: grid;
    min-width: 0;
    gap: 3px;
    padding: 6px 8px;
    border: 1px solid var(--hairline);
    border-bottom: 0;
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--ink);
  }

  .skill-record:first-child {
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .skill-record:last-child {
    border-bottom: 1px solid var(--hairline);
    border-radius: 0 0 var(--radius) var(--radius);
  }

  .skill-record[data-complete="true"] {
    color: var(--ink-muted);
  }

  .skill-name {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
    padding-inline: 4px;
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .skill-name strong {
    overflow: hidden;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-name > span {
    display: contents;
  }

  .skill-name :global(.skill-completion-mark) {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    color: var(--cat-skills);
  }

  .skill-meter {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 8px;
  }

  .skill-segments {
    display: flex;
    min-width: 0;
    flex: 1;
    gap: 2px;
  }

  .skill-segments > span {
    height: 5px;
    flex: 1;
    overflow: hidden;
    background: color-mix(in srgb, var(--cat-skills) 14%, transparent);
  }

  .skill-segments i {
    display: block;
    height: 100%;
    background: var(--cat-skills);
    transition: width 300ms ease-out;
  }

  .skill-count {
    min-width: 72px;
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    text-align: right;
    white-space: nowrap;
  }

  .skill-count:is(:hover, :focus-visible) {
    color: var(--cat-skills);
    outline: 2px solid var(--cat-skills);
    outline-offset: -2px;
  }

  .skill-record[data-compact="true"] {
    padding-block: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    .skill-segments i {
      transition-duration: 0.01ms;
    }
  }
</style>
