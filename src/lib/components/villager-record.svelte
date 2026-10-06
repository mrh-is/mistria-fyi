<script lang="ts">
  import IconMinus from "@tabler/icons-svelte-runes/icons/minus";
  import IconPlus from "@tabler/icons-svelte-runes/icons/plus";
  import { tick } from "svelte";

  import { Icon } from "#lib/components/icon/index.js";
  import Spoiler from "#lib/components/spoiler.svelte";
  import { getName } from "#lib/data/names.js";
  import { celebrateCategory } from "#lib/effects/celebrate.js";
  import {
    isCategoryComplete,
    isVillagerComplete,
    MAX_VILLAGER_LEVEL,
  } from "#lib/engine/progress.js";
  import { getMarriedVillager, relationshipPresentation } from "#lib/engine/relationships.js";
  import * as m from "#lib/paraglide/messages.js";
  import { villagerSpriteUrl } from "#lib/sprites/sprite-url.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { seasonLabel, seasonLabelAbbr } from "#lib/utils/format.js";
  import { relationshipLevelColor } from "#lib/utils/palette.js";
  import { page } from "$app/state";

  import type {
    RelationshipActionValue,
    RelationshipPrompt,
    RelationshipStatus,
  } from "#lib/engine/relationships.js";
  import type { Villager, VillagerId } from "#lib/types/tracker-data.js";

  let {
    compact = false,
    id,
    known,
    name,
    villager,
  }: {
    compact?: boolean;
    id: VillagerId;
    known: boolean;
    /** Already resolved for the active locale by the roster via `getName("villagers", id, locale)`. */
    name: string;
    villager: Villager;
  } = $props();

  const instanceId = $props.id();
  const warningId = `${instanceId}-marriage-warning`;
  let relationshipStatusLabel: Record<RelationshipStatus, string> = $derived({
    best_friends: getName("ui", "best_friend", page.data.locale),
    dating: getName("ui", "dating", page.data.locale),
    engaged: getName("ui", "engaged", page.data.locale),
    married: getName("ui", "married", page.data.locale),
    married_child_free: m.relationship_status_married_child_free(),
    married_kids: m.relationship_status_married_kids(),
    path_not_chosen: m.relationship_status_path_not_chosen(),
  });
  let relationshipPromptLabel: Record<RelationshipPrompt, string> = $derived({
    choose_path: m.relationship_prompt_choose_path(),
    household: m.relationship_prompt_household(),
    next_note: m.relationship_prompt_next_note(),
  });
  let relationshipActionLabel: Record<RelationshipActionValue, string> = $derived({
    married: m.relationship_action_married(),
    no: m.relationship_action_no(),
    platonic: getName("ui", "best_friend", page.data.locale),
    proposed: m.relationship_action_proposed(),
    romantic: m.relationship_action_romantic(),
    yes: m.relationship_action_yes(),
  });
  let recordElement: HTMLLIElement;
  let locallyRevealed = $state(false);
  let imageFailed = $state(false);
  let revealed = $derived(known || locallyRevealed);
  let storedLevel = $derived(userState.state.completed.villagerLevels[id] ?? 0);
  let displayedLevel = $derived(revealed ? storedLevel : 0);
  let relationship = $derived(userState.state.completed.villagerRelationships[id] ?? "undecided");
  let presentation = $derived(
    relationshipPresentation({
      childChoice: userState.state.completed.childChoice,
      level: storedLevel,
      marriedVillager: getMarriedVillager(userState.state.completed.villagerRelationships),
      relationship,
      villagerId: id,
    }),
  );
  let completed = $derived(isVillagerComplete(id, userState.state.completed));
  let visibleName = $derived(revealed ? name : m.villager_hidden_name());

  async function applyAction(value: RelationshipActionValue): Promise<void> {
    mutateWithCelebration(() => {
      if (value === "yes" || value === "no") userState.setChildChoice(value);
      else userState.setVillagerRelationship(id, value);
    });

    await tick();
    const nextAction = recordElement.querySelector<HTMLButtonElement>("[data-relationship-action]");
    if (nextAction) nextAction.focus();
    else recordElement.focus();
  }

  function areAllVillagersComplete(): boolean {
    return isCategoryComplete("villagers", userState.state);
  }

  function mutateWithCelebration(mutate: () => void): void {
    const wasCategoryComplete = areAllVillagersComplete();
    mutate();
    if (!wasCategoryComplete && areAllVillagersComplete()) celebrateCategory();
  }

  function setLevel(level: number): void {
    mutateWithCelebration(() => {
      userState.setVillagerLevel(id, level);
    });
  }
</script>

<li
  bind:this={recordElement}
  class="villager-record"
  class:villager-record--complete={completed}
  class:villager-record--spoilered={!revealed}
  data-villager-record
  data-compact={compact}
  id="villager-{id}"
  tabindex="-1"
>
  <header class="villager-identity">
    <span class="villager-icon" data-spoilered={!revealed} aria-hidden="true">
      {#if !imageFailed}
        <img
          src={villagerSpriteUrl(id)}
          alt=""
          width="44"
          height="44"
          crossorigin="anonymous"
          onerror={() => (imageFailed = true)}
        />
      {:else}
        <span data-testid="villager-icon-fallback">{revealed ? name.charAt(0) : "?"}</span>
      {/if}
    </span>

    <span class="villager-copy">
      <strong data-villager-name>
        {#if revealed}
          {name}
        {:else}
          <Spoiler onReveal={() => (locallyRevealed = true)}>{name}</Spoiler>
        {/if}
      </strong>
      {#if revealed && villager.dateable && presentation.status}
        <small>{relationshipStatusLabel[presentation.status]}</small>
      {/if}
    </span>

    {#if revealed}
      <span
        class="villager-birthday"
        aria-label={m.villager_birthday_aria({
          day: villager.birthday.day,
          season: seasonLabel(villager.birthday.season, page.data.locale),
        })}
      >
        <Icon.Season season={villager.birthday.season} class="size-3" aria-hidden="true" />
        {seasonLabelAbbr(villager.birthday.season)}
        {String(villager.birthday.day).padStart(2, "0")}
      </span>
    {:else}
      <span class="villager-birthday villager-birthday--hidden">{m.villager_birthday_hidden()}</span
      >
    {/if}
  </header>

  <div
    class="villager-meter"
    role="group"
    aria-label={m.villager_relationship_level_aria({
      level: displayedLevel,
      max: MAX_VILLAGER_LEVEL,
      name: visibleName,
    })}
  >
    <span class="sr-only" role="status">
      {m.villager_relationship_level_aria({
        level: displayedLevel,
        max: MAX_VILLAGER_LEVEL,
        name: visibleName,
      })}
    </span>
    <button
      class="villager-stepper"
      type="button"
      disabled={!revealed || storedLevel <= 0}
      aria-label={m.villager_decrease_hearts({
        name: revealed ? name : m.villager_hidden_name_lower(),
      })}
      onclick={() => {
        setLevel(storedLevel - 1);
      }}
    >
      <IconMinus aria-hidden="true" />
    </button>

    <span class="villager-marks" aria-hidden="true">
      {#each { length: MAX_VILLAGER_LEVEL } as _, index (index)}
        {@const filled = revealed && index < storedLevel}
        <span
          class="villager-mark"
          data-villager-mark
          data-villager-mark-filled={filled}
          data-villager-mark-kind={villager.dateable ? "dateable" : "platonic"}
          style="--mark-color: {relationshipLevelColor(index)}"
        >
          <Icon.ProgressMark
            type={villager.dateable ? "relationship_dateable" : "relationship_platonic"}
          />
        </span>
      {/each}
    </span>

    <button
      class="villager-stepper"
      type="button"
      disabled={!revealed || storedLevel >= MAX_VILLAGER_LEVEL}
      aria-label={m.villager_increase_hearts({
        name: revealed ? name : m.villager_hidden_name_lower(),
      })}
      onclick={() => {
        setLevel(storedLevel + 1);
      }}
    >
      <IconPlus aria-hidden="true" />
    </button>
  </div>

  {#if revealed && villager.dateable && presentation.actions.length > 0}
    <div class="relationship-decision">
      <span class="relationship-prompt">
        {presentation.prompt ? relationshipPromptLabel[presentation.prompt] : ""}
      </span>
      <span class="relationship-actions">
        {#each presentation.actions as action (action)}
          <button
            type="button"
            data-relationship-action
            aria-describedby={action === "married" ? warningId : undefined}
            onclick={() => applyAction(action)}
          >
            {relationshipActionLabel[action]}
          </button>
        {/each}
      </span>
      {#if presentation.warning}
        <small id={warningId} class="relationship-warning">
          {m.relationship_warning_marriage()}
        </small>
      {/if}
    </div>
  {/if}
</li>

<style>
  .villager-record {
    display: grid;
    min-width: 0;
    gap: 7px;
    /* Clears the sticky category header when a search link targets this record by hash. */
    scroll-margin-block-start: calc(88px + env(safe-area-inset-top));
    padding: 8px;
    border: 1px solid var(--hairline);
    border-bottom: 0;
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--ink);
  }

  .villager-record:first-child {
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .villager-record:last-child {
    border-bottom: 1px solid var(--hairline);
    border-radius: 0 0 var(--radius) var(--radius);
  }

  .villager-record:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--cat-villagers);
    outline-offset: -2px;
  }

  .villager-record--complete {
    color: var(--ink-muted);
  }

  .villager-identity {
    display: grid;
    min-width: 0;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .villager-icon {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--cat-villagers) 25%, var(--hairline));
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--cat-villagers) 11%, var(--paper));
    color: var(--cat-villagers);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-style: var(--font-display-style);
  }

  .villager-icon img {
    width: 44px;
    height: 44px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .villager-icon[data-spoilered="true"] {
    filter: grayscale(1);
    opacity: 0.35;
  }

  .villager-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    line-height: 1.1;
  }

  .villager-copy strong {
    overflow: hidden;
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .villager-copy small {
    color: var(--ink);
    font-family: var(--font-data);
    font-size: var(--text-3xs);
  }

  .villager-birthday {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    white-space: nowrap;
  }

  .villager-birthday--hidden {
    font-size: var(--text-3xs);
  }

  .villager-meter {
    display: grid;
    min-width: 0;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 6px;
  }

  .villager-stepper {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid var(--hairline);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--paper-raised) 92%, transparent);
    color: var(--ink-muted);
  }

  .villager-stepper :global(svg) {
    width: 16px;
    height: 16px;
  }

  .villager-stepper:is(:hover, :focus-visible):not(:disabled) {
    border-color: var(--cat-villagers);
    color: var(--cat-villagers);
    outline: 2px solid var(--cat-villagers);
    outline-offset: -2px;
  }

  .villager-stepper:disabled {
    opacity: 0.38;
  }

  .villager-marks {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    align-items: center;
    justify-items: center;
    gap: 2px 0;
  }

  .villager-mark {
    display: grid;
    width: 100%;
    max-width: 20px;
    place-items: center;
    color: color-mix(in srgb, var(--ink-muted) 38%, transparent);
  }

  .villager-mark :global(svg) {
    width: 15px;
    height: 15px;
    fill: transparent;
    transition:
      color 180ms ease-out,
      fill 180ms ease-out;
  }

  .villager-mark[data-villager-mark-filled="true"] :global(svg) {
    fill: var(--mark-color);
    color: var(--mark-color);
  }

  .relationship-decision {
    display: grid;
    gap: 5px;
    padding: 6px 8px;
    border-top: 1px solid color-mix(in srgb, var(--cat-villagers) 28%, var(--hairline));
    background: color-mix(in srgb, var(--cat-villagers) 5%, transparent);
  }

  .relationship-prompt {
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-3xs);
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
    border: 1px solid var(--cat-villagers);
    border-radius: var(--radius);
    background: var(--paper-raised);
    color: var(--ink);
    font-family: var(--font-body);
    font-weight: 650;
  }

  .relationship-actions button:is(:hover, :focus-visible) {
    background: color-mix(in srgb, var(--cat-villagers) 10%, var(--paper-raised));
    outline: 2px solid var(--cat-villagers);
    outline-offset: -2px;
  }

  .relationship-warning {
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    line-height: 1.25;
  }

  .villager-record[data-compact="true"] {
    gap: 5px;
    padding-block: 6px;
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .villager-meter {
      grid-template-columns: 32px minmax(0, 1fr) 32px;
    }

    .villager-stepper {
      width: 32px;
      height: 32px;
    }

    .villager-marks {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .relationship-actions button {
      min-height: 32px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .villager-mark :global(svg) {
      transition-duration: 0.01ms;
    }
  }
</style>
