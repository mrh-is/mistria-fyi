<script lang="ts">
  import { tick } from "svelte";

  import { imageError } from "#lib/attachments/image-error.js";
  import { Icon } from "#lib/components/icon/index.js";
  import Spoiler from "#lib/components/spoiler.svelte";
  import Stepper from "#lib/components/stepper.svelte";
  import { getName } from "#lib/data/names.js";
  import { celebrateCategory } from "#lib/effects/celebrate.js";
  import { isCategoryComplete, isVillagerComplete, MAX_HEART_LEVEL } from "#lib/engine/progress.js";
  import { getSpouseId, relationshipPresentation } from "#lib/engine/relationships.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
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
    name,
    spoilered,
    villager,
  }: {
    compact?: boolean;
    id: VillagerId;
    /** Already resolved for the active locale by the roster via `getName("villagers", id, locale)`. */
    name: string;
    spoilered: boolean;
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
  let spoilerDismissed = $state(false);
  let imageFailed = $state(false);
  let isSpoilered = $derived(spoilered && !spoilerDismissed);
  const feedbackContext = getFeedbackContext();
  // A spoilered villager reports without its name or id, like a spoilered tracker row.
  let reportable = $derived(
    feedbackContext.reportableAttachment(
      isSpoilered
        ? {
            category: "villager",
            displayName: m.villager_spoilered_name(),
            page: page.url.pathname,
          }
        : { category: "villager", displayName: name, entityId: id, page: page.url.pathname },
    ),
  );
  let storedLevel = $derived(userState.state.progress.heartLevels[id] ?? 0);
  let displayedLevel = $derived(isSpoilered ? 0 : storedLevel);
  let relationship = $derived(userState.state.progress.villagerRelationships[id] ?? "undecided");
  let presentation = $derived(
    relationshipPresentation({
      childChoice: userState.state.progress.childChoice,
      level: storedLevel,
      marriedVillager: getSpouseId(userState.state.progress.villagerRelationships),
      relationship,
      villagerId: id,
    }),
  );
  let completed = $derived(isVillagerComplete(id, userState.state.progress));
  let visibleName = $derived(isSpoilered ? m.villager_spoilered_name() : name);

  async function applyAction(value: RelationshipActionValue): Promise<void> {
    // The roster can unmount this record once the action settles it (completed rows hidden),
    // which nulls `recordElement`, so resolve the fallback focus targets first.
    const record = recordElement;
    const neighbor = record.nextElementSibling ?? record.previousElementSibling;
    const list = record.parentElement;
    mutateWithCelebration(() => {
      if (value === "yes" || value === "no") userState.setChildChoice(value);
      else userState.setVillagerRelationship(id, value);
    });

    await tick();
    if (record.isConnected) {
      const nextAction = record.querySelector<HTMLButtonElement>("[data-relationship-action]");
      if (nextAction) nextAction.focus();
      else record.focus();
    } else if (neighbor instanceof HTMLElement && neighbor.isConnected) {
      neighbor.focus();
    } else {
      list?.focus();
    }
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
      userState.setHeartLevel(id, level);
    });
  }
</script>

<li
  bind:this={recordElement}
  {@attach reportable}
  class="villager-record"
  class:villager-record--complete={completed}
  class:villager-record--spoilered={isSpoilered}
  data-villager-record
  data-compact={compact}
  id="villager-{id}"
  tabindex="-1"
>
  <header class="villager-identity">
    <span class="villager-icon" data-spoilered={isSpoilered} aria-hidden="true">
      {#if !imageFailed}
        <img
          src={villagerSpriteUrl(id)}
          alt=""
          width="44"
          height="44"
          crossorigin="anonymous"
          {@attach imageError(() => (imageFailed = true))}
        />
      {:else}
        <span data-testid="villager-icon-fallback">{isSpoilered ? "?" : name.charAt(0)}</span>
      {/if}
    </span>

    <span class="villager-copy">
      <strong data-villager-name>
        {#if isSpoilered}
          <Spoiler onReveal={() => (spoilerDismissed = true)}>{name}</Spoiler>
        {:else}
          {name}
        {/if}
      </strong>
      {#if !isSpoilered && villager.dateable && presentation.status}
        <small>{relationshipStatusLabel[presentation.status]}</small>
      {/if}
    </span>

    {#if !isSpoilered}
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
      <span class="villager-birthday villager-birthday--spoilered"
        >{m.villager_birthday_spoilered()}</span
      >
    {/if}
  </header>

  <Stepper
    accentColor="var(--color-category-villagers)"
    decrementDisabled={isSpoilered || storedLevel <= 0}
    decrementLabel={m.villager_decrease_hearts({
      name: isSpoilered ? m.villager_spoilered_name_lower() : name,
    })}
    incrementDisabled={isSpoilered || storedLevel >= MAX_HEART_LEVEL}
    incrementLabel={m.villager_increase_hearts({
      name: isSpoilered ? m.villager_spoilered_name_lower() : name,
    })}
    label={m.villager_relationship_level_aria({
      level: displayedLevel,
      max: MAX_HEART_LEVEL,
      name: visibleName,
    })}
    onDecrement={() => {
      setLevel(storedLevel - 1);
    }}
    onIncrement={() => {
      setLevel(storedLevel + 1);
    }}
  >
    <span class="sr-only" role="status">
      {m.villager_relationship_level_aria({
        level: displayedLevel,
        max: MAX_HEART_LEVEL,
        name: visibleName,
      })}
    </span>
    <span class="villager-marks" aria-hidden="true">
      {#each { length: MAX_HEART_LEVEL } as _, index (index)}
        {@const filled = !isSpoilered && index < storedLevel}
        <span
          class="villager-mark"
          data-villager-mark
          data-villager-mark-filled={filled}
          data-villager-mark-kind={villager.dateable ? "dateable" : "platonic"}
          style="--relationship-level-color: {relationshipLevelColor(index)}"
        >
          <Icon.ProgressMark
            type={villager.dateable ? "relationship_dateable" : "relationship_platonic"}
          />
        </span>
      {/each}
    </span>
  </Stepper>

  {#if !isSpoilered && villager.dateable && presentation.actions.length > 0}
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
      {#if presentation.showsMarriageWarning}
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
    border: 1px solid var(--color-ink-hairline);
    border-bottom: 0;
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--color-ink);
  }

  .villager-record:first-child {
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .villager-record:last-child {
    border-bottom: 1px solid var(--color-ink-hairline);
    border-radius: 0 0 var(--radius) var(--radius);
  }

  .villager-record:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--color-category-villagers);
    outline-offset: -2px;
  }

  .villager-record--complete {
    color: var(--color-ink-muted);
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
    border: 1px solid
      color-mix(in srgb, var(--color-category-villagers) 25%, var(--color-ink-hairline));
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--color-category-villagers) 11%, var(--color-paper));
    color: var(--color-category-villagers);
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
    color: var(--color-ink);
    font-family: var(--font-data);
    font-size: var(--text-3xs);
  }

  .villager-birthday {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    white-space: nowrap;
  }

  .villager-birthday--spoilered {
    font-size: var(--text-3xs);
  }

  .villager-marks {
    display: grid;
    min-width: 0;
    flex: 1;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: center;
    justify-items: center;
    gap: 2px 0;
  }

  .villager-mark {
    display: grid;
    width: 100%;
    max-width: 20px;
    place-items: center;
    color: color-mix(in srgb, var(--color-ink-muted) 38%, transparent);
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
    fill: var(--relationship-level-color);
    color: var(--relationship-level-color);
  }

  .relationship-decision {
    display: grid;
    gap: 5px;
    padding: 6px 8px;
    border-top: 1px solid
      color-mix(in srgb, var(--color-category-villagers) 28%, var(--color-ink-hairline));
    background: color-mix(in srgb, var(--color-category-villagers) 5%, transparent);
  }

  .relationship-prompt {
    color: var(--color-ink-muted);
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
    border: 1px solid var(--color-category-villagers);
    border-radius: var(--radius);
    background: var(--color-paper-raised);
    color: var(--color-ink);
    font-family: var(--font-body);
    font-weight: 650;
  }

  .relationship-actions button:is(:active, :focus-visible) {
    background: color-mix(in srgb, var(--color-category-villagers) 10%, var(--color-paper-raised));
    outline: 2px solid var(--color-category-villagers);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .relationship-actions button:hover {
      background: color-mix(
        in srgb,
        var(--color-category-villagers) 10%,
        var(--color-paper-raised)
      );
      outline: 2px solid var(--color-category-villagers);
      outline-offset: -2px;
    }
  }

  .relationship-warning {
    color: var(--color-ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    line-height: 1.25;
  }

  .villager-record[data-compact="true"] {
    gap: 5px;
    padding-block: 6px;
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .villager-marks {
      grid-template-columns: repeat(10, minmax(0, 1fr));
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
