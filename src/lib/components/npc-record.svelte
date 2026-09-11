<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";
  import { tick } from "svelte";

  import { Icon } from "$lib/components/icon/index.js";
  import Spoiler from "$lib/components/spoiler.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isNpcComplete, MAX_NPC_LEVEL } from "$lib/engine/progress.js";
  import {
    getMarriedNpc,
    type RelationshipActionValue,
    relationshipPresentation,
  } from "$lib/engine/relationships.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordKeys } from "$lib/utils";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import type { Npc, NpcId, Season } from "$lib/types/tracker-data.js";

  let {
    compact = false,
    id,
    known,
    npc,
  }: {
    compact?: boolean;
    id: NpcId;
    known: boolean;
    npc: Npc;
  } = $props();

  const instanceId = $props.id();
  const warningId = `${instanceId}-marriage-warning`;
  const seasonAbbreviation: Record<Season, string> = {
    fall: "FAL",
    spring: "SPR",
    summer: "SUM",
    winter: "WIN",
  };
  const seasonName: Record<Season, string> = {
    fall: "Fall",
    spring: "Spring",
    summer: "Summer",
    winter: "Winter",
  };
  const levelColors = [
    "#7c3aed",
    "#4338ca",
    "#2563eb",
    "#38bdf8",
    "#22c55e",
    "#a3e635",
    "#fbbf24",
    "#fde047",
    "#f97316",
    "#ea580c",
    "#ef4444",
    "#be123c",
  ];

  let recordElement: HTMLLIElement;
  let locallyRevealed = $state(false);
  let imageFailed = $state(false);
  let revealed = $derived(known || locallyRevealed);
  let storedLevel = $derived(userState.state.completed.npcLevels[id] ?? 0);
  let displayedLevel = $derived(revealed ? storedLevel : 0);
  let relationship = $derived(userState.state.completed.npcRelationships[id] ?? "undecided");
  let presentation = $derived(
    relationshipPresentation({
      childChoice: userState.state.completed.childChoice,
      level: storedLevel,
      marriedNpc: getMarriedNpc(userState.state.completed.npcRelationships),
      npcId: id,
      relationship,
    }),
  );
  let completed = $derived(isNpcComplete(id, userState.state.completed));
  let visibleName = $derived(revealed ? npc.name : "Hidden NPC");

  function areAllNpcsComplete(): boolean {
    return recordKeys(trackerData.npcs).every((npcId) =>
      isNpcComplete(npcId, userState.state.completed),
    );
  }

  function mutateWithCelebration(mutate: () => void): void {
    const wasCategoryComplete = areAllNpcsComplete();
    mutate();
    if (!wasCategoryComplete && areAllNpcsComplete()) celebrateCategory();
  }

  function setLevel(level: number): void {
    mutateWithCelebration(() => {
      userState.setNpcLevel(id, level);
    });
  }

  async function applyAction(value: RelationshipActionValue): Promise<void> {
    mutateWithCelebration(() => {
      if (value === "yes" || value === "no") userState.setChildChoice(value);
      else userState.setNpcRelationship(id, value);
    });

    await tick();
    const nextAction = recordElement.querySelector<HTMLButtonElement>("[data-relationship-action]");
    if (nextAction) nextAction.focus();
    else recordElement.focus();
  }
</script>

<li
  bind:this={recordElement}
  class="npc-record"
  class:npc-record--complete={completed}
  class:npc-record--spoilered={!revealed}
  data-npc-record
  data-compact={compact}
  id="npc-{id}"
  tabindex="-1"
>
  <header class="npc-identity">
    <span class="npc-icon" data-spoilered={!revealed} aria-hidden="true">
      {#if npc.smallIconSprite && !imageFailed}
        <img
          src="/npc-sprites/{npc.smallIconSprite}.webp"
          alt=""
          width="44"
          height="44"
          onerror={() => (imageFailed = true)}
        />
      {:else}
        <span data-testid="npc-icon-fallback">{revealed ? npc.name.charAt(0) : "?"}</span>
      {/if}
    </span>

    <span class="npc-copy">
      <strong>
        {#if revealed}
          {npc.name}
        {:else}
          <Spoiler onReveal={() => (locallyRevealed = true)}>{npc.name}</Spoiler>
        {/if}
      </strong>
      {#if revealed && npc.dateable && presentation.label}
        <small>{presentation.label}</small>
      {/if}
    </span>

    {#if revealed}
      <span
        class="npc-birthday"
        aria-label="Birthday: {seasonName[npc.birthday.season]} {npc.birthday.day}"
      >
        <Icon.Season season={npc.birthday.season} class="size-3" aria-hidden="true" />
        {seasonAbbreviation[npc.birthday.season]}
        {String(npc.birthday.day).padStart(2, "0")}
      </span>
    {:else}
      <span class="npc-birthday npc-birthday--hidden">Birthday hidden</span>
    {/if}
  </header>

  <div
    class="npc-meter"
    role="group"
    aria-label="{visibleName} relationship level, {displayedLevel} of {MAX_NPC_LEVEL}"
  >
    <button
      class="npc-stepper"
      type="button"
      disabled={!revealed || storedLevel <= 0}
      aria-label="Decrease {revealed ? npc.name : 'hidden NPC'} hearts"
      onclick={() => {
        setLevel(storedLevel - 1);
      }}
    >
      <Minus aria-hidden="true" />
    </button>

    <span class="npc-marks" aria-hidden="true">
      {#each { length: MAX_NPC_LEVEL } as _, index (index)}
        {@const filled = revealed && index < storedLevel}
        <span
          class="npc-mark"
          data-npc-mark
          data-npc-mark-filled={filled}
          data-npc-mark-kind={npc.dateable ? "dateable" : "platonic"}
          style="--mark-color: {levelColors[index]}"
        >
          <Icon.ProgressMark
            type={npc.dateable ? "relationship_dateable" : "relationship_platonic"}
          />
        </span>
      {/each}
    </span>

    <button
      class="npc-stepper"
      type="button"
      disabled={!revealed || storedLevel >= MAX_NPC_LEVEL}
      aria-label="Increase {revealed ? npc.name : 'hidden NPC'} hearts"
      onclick={() => {
        setLevel(storedLevel + 1);
      }}
    >
      <Plus aria-hidden="true" />
    </button>
  </div>

  {#if revealed && npc.dateable && presentation.actions.length > 0}
    <div class="relationship-decision">
      <span class="relationship-prompt">{presentation.prompt}</span>
      <span class="relationship-actions">
        {#each presentation.actions as action (action.value)}
          <button
            type="button"
            data-relationship-action
            aria-describedby={action.value === "married" ? warningId : undefined}
            onclick={() => applyAction(action.value)}
          >
            {action.label}
          </button>
        {/each}
      </span>
      {#if presentation.warning}
        <small id={warningId} class="relationship-warning">{presentation.warning}</small>
      {/if}
    </div>
  {/if}
</li>

<style>
  .npc-record {
    display: grid;
    min-width: 0;
    gap: 7px;
    padding: 8px;
    border: 1px solid var(--hairline);
    border-bottom: 0;
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--ink);
  }

  .npc-record:first-child {
    border-radius: 2px 2px 0 0;
  }

  .npc-record:last-child {
    border-bottom: 1px solid var(--hairline);
    border-radius: 0 0 2px 2px;
  }

  .npc-record:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--cat-npcs);
    outline-offset: -2px;
  }

  .npc-record--complete {
    color: var(--ink-muted);
  }

  .npc-identity {
    display: grid;
    min-width: 0;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .npc-icon {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--cat-npcs) 25%, var(--hairline));
    border-radius: 2px;
    background: color-mix(in srgb, var(--cat-npcs) 11%, var(--paper));
    color: var(--cat-npcs);
    font-family: var(--font-display);
    font-size: 24px;
    font-style: italic;
  }

  .npc-icon img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .npc-icon[data-spoilered="true"] {
    filter: grayscale(1);
    opacity: 0.35;
  }

  .npc-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    line-height: 1.1;
  }

  .npc-copy strong {
    overflow: hidden;
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .npc-copy small {
    color: var(--ink);
    font-family: var(--font-data);
    font-size: 10px;
  }

  .npc-birthday {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 11px;
    white-space: nowrap;
  }

  .npc-birthday--hidden {
    font-size: 10px;
  }

  .npc-meter {
    display: grid;
    min-width: 0;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 6px;
  }

  .npc-stepper {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid var(--hairline);
    border-radius: 2px;
    background: color-mix(in srgb, var(--paper-raised) 92%, transparent);
    color: var(--ink-muted);
  }

  .npc-stepper :global(svg) {
    width: 16px;
    height: 16px;
  }

  .npc-stepper:is(:hover, :focus-visible):not(:disabled) {
    border-color: var(--cat-npcs);
    color: var(--cat-npcs);
    outline: 2px solid var(--cat-npcs);
    outline-offset: -2px;
  }

  .npc-stepper:disabled {
    opacity: 0.38;
  }

  .npc-marks {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    align-items: center;
    justify-items: center;
    gap: 2px 0;
  }

  .npc-mark {
    display: grid;
    width: 100%;
    max-width: 20px;
    place-items: center;
    color: color-mix(in srgb, var(--ink-muted) 38%, transparent);
  }

  .npc-mark :global(svg) {
    width: 15px;
    height: 15px;
    fill: transparent;
    transition:
      color 180ms ease-out,
      fill 180ms ease-out;
  }

  .npc-mark[data-npc-mark-filled="true"] :global(svg) {
    fill: var(--mark-color);
    color: var(--mark-color);
  }

  .relationship-decision {
    display: grid;
    gap: 5px;
    padding: 6px 8px;
    border-top: 1px solid color-mix(in srgb, var(--cat-npcs) 28%, var(--hairline));
    background: color-mix(in srgb, var(--cat-npcs) 5%, transparent);
  }

  .relationship-prompt {
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 10px;
    text-transform: uppercase;
  }

  .relationship-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .relationship-actions button {
    min-height: 44px;
    flex: 1 1 9rem;
    padding: 7px 10px;
    border: 1px solid var(--cat-npcs);
    border-radius: 2px;
    background: var(--paper-raised);
    color: var(--ink);
    font-family: var(--font-body);
    font-weight: 650;
  }

  .relationship-actions button:is(:hover, :focus-visible) {
    background: color-mix(in srgb, var(--cat-npcs) 10%, var(--paper-raised));
    outline: 2px solid var(--cat-npcs);
    outline-offset: -2px;
  }

  .relationship-warning {
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.25;
  }

  .npc-record[data-compact="true"] {
    gap: 5px;
    padding-block: 6px;
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .npc-meter {
      grid-template-columns: 32px minmax(0, 1fr) 32px;
    }

    .npc-stepper {
      width: 32px;
      height: 32px;
    }

    .npc-marks {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .relationship-actions button {
      min-height: 32px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .npc-mark :global(svg) {
      transition-duration: 0.01ms;
    }
  }
</style>
