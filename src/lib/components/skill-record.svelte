<script lang="ts">
  import IconCompletion from "#lib/components/icon/icon-completion.svelte";
  import SkillPerks from "#lib/components/skill-perks.svelte";
  import Stepper from "#lib/components/stepper.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import { celebrateCategory } from "#lib/effects/celebrate.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SkillId } from "#lib/types/tracker-data.js";

  /** The level bar's quarters, each spanning an equal share of `MAX_SKILL_LEVEL`. */
  const SEGMENT_COUNT = 4;
  const SEGMENT_SPAN = MAX_SKILL_LEVEL / SEGMENT_COUNT;
  const SEGMENTS = Array.from({ length: SEGMENT_COUNT }, (_, index) => ({
    start: index * SEGMENT_SPAN,
    end: (index + 1) * SEGMENT_SPAN,
  }));

  let {
    compact = false,
    id,
    locale,
    name,
  }: { compact?: boolean; id: SkillId; locale: LocaleCode; name: string } = $props();

  const feedbackContext = getFeedbackContext();
  let level = $derived(userState.state.progress.skillLevels[id] ?? 0);
  let complete = $derived(isSkillComplete(id, userState.state.progress));
  let reportable = $derived(
    feedbackContext.reportableAttachment({
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
    const wasDone = isCategoryComplete("skills", userState.state);
    userState.setSkillLevel(id, newLevel);
    if (!wasDone && isCategoryComplete("skills", userState.state)) celebrateCategory();
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
  data-complete={complete}
  {@attach reportable}
>
  <span class="skill-name">
    {#if complete}
      <span data-testid="skill-completion-mark">
        <IconCompletion state="completed" class="skill-completion-mark" />
      </span>
    {/if}
    <strong>{name}</strong>
  </span>

  <Stepper
    accentColor="var(--color-category-skills)"
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

  <SkillPerks {id} {locale} {name} />
</li>

<style>
  .skill-record {
    display: grid;
    min-width: 0;
    gap: 3px;
    padding: 6px 8px;
    border: 1px solid var(--color-ink-hairline);
    border-bottom: 0;
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--color-ink);
  }

  .skill-record:first-child {
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .skill-record:last-child {
    border-bottom: 1px solid var(--color-ink-hairline);
    border-radius: 0 0 var(--radius) var(--radius);
  }

  .skill-record[data-complete="true"] {
    color: var(--color-ink-muted);
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
    color: var(--color-category-skills);
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
    background: color-mix(in srgb, var(--color-category-skills) 14%, transparent);
  }

  .skill-segments i {
    display: block;
    height: 100%;
    background: var(--color-category-skills);
    transition: width 300ms ease-out;
  }

  .skill-count {
    min-width: 72px;
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    text-align: right;
    white-space: nowrap;
  }

  .skill-count:is(:active, :focus-visible) {
    color: var(--color-category-skills);
    outline: 2px solid var(--color-category-skills);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .skill-count:hover {
      color: var(--color-category-skills);
      outline: 2px solid var(--color-category-skills);
      outline-offset: -2px;
    }
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
