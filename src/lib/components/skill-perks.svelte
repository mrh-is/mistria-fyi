<script lang="ts">
  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordKeys } from "#lib/utils/record.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SkillId } from "#lib/types/tracker-data.js";

  let { id, locale, name }: { id: SkillId; locale: LocaleCode; name: string } = $props();

  const panelId = $props.id();
  let expanded = $state(false);

  /** The skill's perk tiers in game order, each with the skill level that opens it. */
  let tiers = $derived(
    trackerData.skills[id].perkTiers.map((tier, index) => ({
      level: trackerData.perkTierLevels[index],
      perks: recordKeys(tier).map((perkId) => ({
        id: perkId,
        name: getName("perks", perkId, locale),
      })),
    })),
  );
  let total = $derived(tiers.reduce((sum, tier) => sum + tier.perks.length, 0));
  let count = $derived(
    tiers.reduce(
      (sum, tier) =>
        sum +
        tier.perks.filter((perk) => userState.state.progress.unlockedPerks.has(perk.id)).length,
      0,
    ),
  );
  let skillLevel = $derived(userState.state.progress.skillLevels[id] ?? 0);
</script>

<div class="skill-perks" data-skill-perks data-expanded={expanded}>
  <button
    class="skill-perks__toggle"
    type="button"
    aria-expanded={expanded}
    aria-controls={expanded ? panelId : undefined}
    aria-label={m.skill_perks_toggle_aria({ count, name, total })}
    onclick={() => {
      expanded = !expanded;
    }}
  >
    <span class="skill-perks__label">{m.skill_perks_label()}</span>
    <span class="skill-perks__count">{count} / {total}</span>
    <svg class="skill-perks__chevron" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M3 1L7 5L3 9"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>

  {#if expanded}
    <ol id={panelId} class="skill-perks__tiers">
      {#each tiers as tier (tier.level)}
        <li class="skill-perks__tier" data-perk-tier data-reached={skillLevel >= tier.level}>
          <span class="skill-perks__tier-level">
            {m.skill_perk_tier_level({ level: tier.level })}
          </span>
          <ul
            class="skill-perks__perks"
            aria-label={m.skill_perk_tier_aria({ level: tier.level, name })}
          >
            {#each tier.perks as perk (perk.id)}
              {@const unlocked = userState.state.progress.unlockedPerks.has(perk.id)}
              <li class="skill-perks__perk" data-unlocked={unlocked}>
                <TrackerCheckbox
                  state={unlocked ? "checked" : "unchecked"}
                  label={unlocked
                    ? m.tracker_row_uncheck({ name: perk.name })
                    : m.tracker_row_check({ name: perk.name })}
                  onclick={() => {
                    userState.togglePerk(perk.id);
                  }}
                />
                <span class="skill-perks__perk-name">{perk.name}</span>
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
    margin-top: 2px;
    border-top: 1px dashed var(--color-ink-hairline);
  }

  .skill-perks__toggle {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--color-ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
  }

  .skill-perks__toggle:is(:active, :focus-visible) {
    color: var(--color-category-skills);
    outline: 2px solid var(--color-category-skills);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .skill-perks__toggle:hover {
      color: var(--color-category-skills);
    }
  }

  .skill-perks__label {
    flex: 1;
    font-weight: 600;
  }

  .skill-perks__count {
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .skill-perks__chevron {
    width: 9px;
    height: 9px;
    margin-inline: 4px 8px;
    transform: rotate(90deg);
    transition: transform 260ms ease;
  }

  .skill-perks[data-expanded="true"] .skill-perks__chevron {
    transform: rotate(270deg);
  }

  .skill-perks__tiers {
    display: grid;
    gap: 6px;
    margin: 0 0 4px;
    padding: 0;
    list-style: none;
  }

  .skill-perks__tier {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    align-items: start;
    gap: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--color-ink-hairline);
  }

  .skill-perks__tier-level {
    padding: 12px 4px 0;
    color: var(--color-category-skills);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .skill-perks__tier[data-reached="false"] .skill-perks__tier-level {
    color: var(--color-ink-muted);
  }

  .skill-perks__perks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .skill-perks__perk {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 2px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .skill-perks__perk[data-unlocked="true"] .skill-perks__perk-name {
    color: var(--color-ink-muted);
  }

  .skill-perks__perk-name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  @media (prefers-reduced-motion: reduce) {
    .skill-perks__chevron {
      transition: none;
    }
  }
</style>
