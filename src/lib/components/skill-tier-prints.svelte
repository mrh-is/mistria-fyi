<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";

  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import { getName } from "#lib/data/names.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { PerkId, SkillId } from "#lib/types/tracker-data.js";

  let {
    id,
    level,
    locale,
    tiers,
  }: {
    id: SkillId;
    level: number;
    locale: LocaleCode;
    tiers: readonly { ids: readonly PerkId[]; level: number; number: number }[];
  } = $props();

  let provenance = $derived(userState.provenanceOf(factKey("skillLevels", id)));
</script>

{#snippet perks(ids: readonly PerkId[], reached: boolean)}
  {#each ids as perkId (perkId)}
    {@const name = getName("perks", perkId, locale)}
    <li class="perk">
      <TrackerCheckbox
        fact={factKey("unlockedPerks", perkId)}
        {provenance}
        state={reached ? "checked" : "unchecked"}
        label={reached ? "Reached" : "Unreached"}
      />
      {#if reached || userState.state.showSpoilers}
        <span>{name}</span>
      {:else}
        <span class="sr-only">Spoilered perk</span>
        <span class="blank" aria-hidden="true" style:inline-size={`${[...name].length}ch`}></span>
      {/if}
    </li>
  {/each}
{/snippet}

<ol class="tiers">
  {#each tiers as tier (tier.number)}
    {@const tierName = getName("ui", `tier_${tier.number.toString()}`, locale)}
    {@const threshold = formatNumber(tier.level, locale)}
    <li class="tier">
      <p>{`${tierName} · Lv ${threshold}`}</p>
      {#if level >= tier.level}
        <ul in:fade={{ duration: prefersReducedMotion.current ? 0 : 200 }}>
          {@render perks(tier.ids, true)}
        </ul>
      {:else}
        <ul>
          {@render perks(tier.ids, false)}
        </ul>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .tiers {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }

  .tier {
    min-inline-size: 0;
    padding-inline: 0.5rem;
    border-inline-start: 1px dashed var(--color-rule);
  }

  .tier p {
    margin-block-end: 0.35rem;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-3xs);
    letter-spacing: 0.06em;
    overflow-wrap: anywhere;
    text-transform: uppercase;
  }

  .perk {
    display: flex;
    min-inline-size: 0;
    align-items: flex-start;
    gap: 0.25rem;
    margin-block-end: 0.35rem;
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
  }

  .blank {
    max-inline-size: 100%;
    block-size: 0.9em;
    border-block-end: 1px solid var(--color-rule);
  }

  @media (max-width: 43.75rem) {
    .tier {
      padding: 0.5rem 0 0.25rem;
      border-block-start: 1px dashed var(--color-rule);
      border-inline-start: 0;
    }
  }
</style>
