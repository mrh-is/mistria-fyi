<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { SvelteSet } from "svelte/reactivity";
  import { slide } from "svelte/transition";

  import { Icon } from "#lib/components/icon/index.js";
  import Spoiler from "#lib/components/spoiler.svelte";
  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { celebrateCategory } from "#lib/effects/celebrate.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordKeys } from "#lib/utils/record.js";

  import type { SpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { PerkId, SkillId } from "#lib/types/tracker-data.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let {
    id,
    locale,
    name,
    spoilerGuard,
  }: { id: SkillId; locale: LocaleCode; name: string; spoilerGuard: SpoilerGuard } = $props();

  const panelId = $props.id();
  let expanded = $state(false);
  /** Perks whose spoiler cover the player has tapped away, for this drawer's lifetime. */
  const revealed = new SvelteSet<PerkId>();

  /**
   * The skill's perk tiers in game order. A tier opens at its skill level; until then its unbought
   * perks are spoilered, & checking one asks the spoiler guard first.
   */
  let tiers = $derived(
    trackerData.skills[id].perkTiers.map((tier, index) => {
      const level = trackerData.perkTierLevels[index];
      const condition: VisibilityCondition = { type: "skillLevel", level, skillId: id };
      const visible = isConditionVisible(condition, userState.progressionState);
      return {
        condition,
        level,
        number: index + 1,
        perks: recordKeys(tier).map((perkId) => {
          const unlocked = userState.state.progress.unlockedPerks.has(perkId);
          return {
            id: perkId,
            name: getName("perks", perkId, locale),
            spoilered: !visible && !unlocked,
            unlocked,
          };
        }),
        reached: (userState.state.progress.skillLevels[id] ?? 0) >= level,
      };
    }),
  );
  let perks = $derived(tiers.flatMap((tier) => tier.perks.map((perk) => ({ ...perk, tier }))));
  let unlocked = $derived(perks.filter((perk) => perk.unlocked).length);
  /** Perks the player could have now: every perk in a reached tier, plus any already unlocked. */
  let available = $derived(perks.filter((perk) => perk.tier.reached || perk.unlocked).length);
  let locked = $derived(perks.length - available);
  let toggleLabel = $derived.by(() => {
    if (available === 0) return m.skill_perks_toggle_aria_locked({ locked, name });
    if (locked === 0) return m.skill_perks_toggle_aria({ available, count: unlocked, name });
    return m.skill_perks_toggle_aria_more_locked({ available, count: unlocked, locked, name });
  });

  function togglePerk(perk: (typeof perks)[number]): void {
    const toggle = (): void => {
      const wasDone = isCategoryComplete("skills", userState.progressContext);
      userState.togglePerk(perk.id);
      if (!wasDone && isCategoryComplete("skills", userState.progressContext)) celebrateCategory();
    };
    if (perk.spoilered) spoilerGuard.requestGuardedAction(perk.tier.condition, toggle);
    else toggle();
  }
</script>

<div class="skill-perks" data-skill-perks data-expanded={expanded}>
  <button
    class="skill-perks__toggle"
    type="button"
    aria-expanded={expanded}
    aria-controls={expanded ? panelId : undefined}
    aria-label={toggleLabel}
    onclick={() => {
      expanded = !expanded;
    }}
  >
    <Icon.UI
      type="disclosure"
      class="skill-perks__disclosure size-4 shrink-0 transition-transform motion-reduce:transition-none {expanded
        ? 'rotate-90'
        : ''}"
    />
    <span class="skill-perks__label">{m.skill_perks_label()}</span>
    <span class="skill-perks__summary" aria-hidden="true">
      {#if available > 0}
        <span>{m.skill_perks_unlocked({ available, count: unlocked })}</span>
        {#if locked > 0}
          <span class="skill-perks__locked">{m.skill_perks_more_locked({ count: locked })}</span>
        {/if}
      {:else}
        <span>{m.skill_perks_locked({ count: locked })}</span>
      {/if}
    </span>
  </button>

  {#if expanded}
    <ol
      id={panelId}
      class="skill-perks__tiers"
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}
    >
      {#each tiers as tier (tier.number)}
        <li class="skill-perks__tier" data-perk-tier data-reached={tier.reached}>
          <span class="skill-perks__tier-heading" aria-hidden="true">
            <span class="skill-perks__tier-name"
              >{getName("ui", `tier_${tier.number.toString()}`, locale)}</span
            >
            <span class="skill-perks__tier-rule"></span>
            <span class="skill-perks__tier-level"
              >{m.skill_perk_tier_level({ level: tier.level })}</span
            >
          </span>
          <ul
            class="skill-perks__perks"
            aria-label={m.skill_perk_tier_aria({
              level: tier.level,
              name,
              tier: getName("ui", `tier_${tier.number.toString()}`, locale),
            })}
          >
            {#each tier.perks as perk (perk.id)}
              {@const covered = perk.spoilered && !revealed.has(perk.id)}
              <li class="skill-perks__perk" data-unlocked={perk.unlocked}>
                <TrackerCheckbox
                  state={perk.unlocked ? "checked" : "unchecked"}
                  label={perk.unlocked
                    ? m.tracker_row_uncheck({ name: perk.name })
                    : covered
                      ? m.tracker_row_check_spoilered()
                      : m.tracker_row_check({ name: perk.name })}
                  onclick={() => {
                    togglePerk({ ...perk, tier });
                  }}
                />
                <span class="skill-perks__perk-name">
                  {#if perk.spoilered}
                    <Spoiler
                      spoilered={covered}
                      onReveal={() => {
                        revealed.add(perk.id);
                      }}>{perk.name}</Spoiler
                    >
                  {:else}
                    {perk.name}
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .skill-perks {
    min-width: 0;
  }

  /* A drawer pull: tinted & bordered so it reads as something to open. */
  .skill-perks__toggle {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 6px;
    border: 1px solid var(--color-ink-hairline);
    border-radius: var(--radius);
    background: var(--color-paper-sunken);
    color: var(--color-ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    touch-action: manipulation;
  }

  .skill-perks[data-expanded="true"] .skill-perks__toggle {
    border-bottom-style: dashed;
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .skill-perks__toggle:is(:active, :focus-visible) {
    border-color: var(--color-category-skills);
    outline: 2px solid var(--color-category-skills);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .skill-perks__toggle:hover {
      border-color: var(--color-category-skills);
      background: color-mix(in srgb, var(--color-category-skills) 8%, var(--color-paper-sunken));
    }
  }

  .skill-perks__toggle :global(.skill-perks__disclosure) {
    color: var(--color-category-skills);
  }

  .skill-perks__label {
    flex: 1;
    font-weight: 600;
  }

  .skill-perks__summary {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    font-family: var(--font-data);
    font-size: var(--text-xs);
    line-height: 1.15;
    white-space: nowrap;
  }

  .skill-perks__locked {
    color: var(--color-ink-muted);
    font-size: var(--text-2xs);
  }

  .skill-perks__tiers {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 8px 6px 2px;
    border: 1px solid var(--color-ink-hairline);
    border-top: 0;
    border-radius: 0 0 var(--radius) var(--radius);
    background: color-mix(in srgb, var(--color-paper-sunken) 45%, var(--color-paper-raised));
    list-style: none;
  }

  .skill-perks__tier-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .skill-perks__tier-name {
    color: var(--color-category-skills);
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
    font-style: italic;
  }

  .skill-perks__tier[data-reached="false"] .skill-perks__tier-name {
    color: var(--color-ink-muted);
  }

  .skill-perks__tier-rule {
    flex: 1;
    border-bottom: 1px solid var(--color-ink-hairline);
  }

  .skill-perks__tier-level {
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    white-space: nowrap;
  }

  .skill-perks__perks {
    display: grid;
    margin: 0;
    padding: 0;
    column-gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    list-style: none;
  }

  .skill-perks__perk {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 2px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.15;
  }

  .skill-perks__perk[data-unlocked="true"] .skill-perks__perk-name {
    color: var(--color-ink-muted);
  }

  .skill-perks__perk-name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .skill-perks__toggle {
      min-height: 32px;
    }
  }
</style>
