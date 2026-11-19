<script lang="ts">
  import { ledgerSpriteMask } from "#lib/attachments/ledger-sprite-mask.js";
  import { Icon } from "#lib/components/icon/index.js";
  import SourceCard from "#lib/components/source-card.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import { extractDisplayBadges } from "#lib/engine/availability-condition.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { ledgerSourceFamily } from "#lib/presentation/ledger.js";
  import { buildSourceSegments } from "#lib/sources/source-segments.js";
  import { itemSpriteUrl } from "#lib/sprites/sprite-url.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { seasonLabel } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { CheckboxState } from "#lib/components/tracker-checkbox.svelte";
  import type { SourceFilterId } from "#lib/data/source-filters.js";
  import type { CategoryKey } from "#lib/engine/categories.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { ReportCategory } from "#lib/feedback/types.js";
  import type { LedgerPlacement } from "#lib/presentation/ledger.js";
  import type { SegmentLookups } from "#lib/sources/source-segments.js";
  import type { Source } from "#lib/types/acquisition.js";

  let {
    category,
    columns,
    completed,
    discovery,
    fact,
    highlighted,
    id,
    lookups,
    name,
    obtained = false,
    onToggle,
    placement,
    reportCategory,
    shelf,
    sprite,
    subtitle,
    variant,
  }: {
    category: CategoryKey;
    columns: readonly { type: Source["type"]; id: SourceFilterId }[];
    completed: boolean;
    discovery: boolean;
    fact: string;
    highlighted: boolean;
    id: string;
    lookups: SegmentLookups;
    name: string;
    obtained?: boolean;
    onToggle: (covered: boolean) => void;
    placement: LedgerPlacement;
    reportCategory: ReportCategory;
    shelf: Shelf;
    sprite?: string;
    subtitle?: string;
    variant?: string;
  } = $props();

  const feedback = getFeedbackContext();
  const instance = $props.id();
  const detailsId = `sources-${instance}`;
  let expanded = $state(false);
  let revealed = $state(false);
  let revealSources = $state(false);
  let covered = $derived(placement.spoilered && !revealed && !userState.state.showSpoilers);
  let nameWithVariant = $derived(variant ? /* @wc-include */ `${name}, ${variant}` : name);
  let spriteUrl = $derived(sprite ? itemSpriteUrl(sprite) : undefined);
  let treatment = $derived.by(() => {
    if (covered) return "spoiler";
    if (completed) return "completed";
    return shelf === "todo" ? "todo" : "not-now";
  });
  let sources = $derived(
    (revealSources || revealed || userState.state.showSpoilers
      ? placement.allSources
      : placement.visibleSources
    ).filter((source) => toolbarState.showsSource(source)),
  );
  let waitingSeasons = $derived([
    ...new Set(
      placement.seasonalSources
        .filter(({ source }) => toolbarState.showsSource(source))
        .flatMap(({ seasons }) => seasons),
    ),
  ]);
  let checkState = $derived.by<CheckboxState>(() => {
    if (covered) return "unchecked";
    if (completed) return "checked";
    return obtained ? "obtained" : "unchecked";
  });
  let reportable = $derived(
    covered
      ? { category: reportCategory, displayName: "Spoilered item", page: page.url.pathname }
      : { category: reportCategory, displayName: name, entityId: id, page: page.url.pathname },
  );
</script>

<div
  data-tracker-row
  data-ledger-row
  data-highlighted={highlighted}
  data-source-state={expanded ? "open" : "closed"}
  style:--sprite-tint={`var(--color-category-${category})`}
  {@attach feedback.reportableAttachment(reportable)}
>
  <div class="line">
    <TrackerCheckbox
      {fact}
      provenance={userState.provenanceOf(fact)}
      state={checkState}
      label={covered
        ? "Check spoilered item"
        : completed
          ? `Uncheck ${nameWithVariant}`
          : `Check ${nameWithVariant}`}
      onclick={() => onToggle(covered)}
    />
    {#if spriteUrl}
      <span
        class="sprite"
        data-sprite-treatment={treatment}
        {@attach treatment === "todo" || treatment === "spoiler"
          ? ledgerSpriteMask(spriteUrl)
          : undefined}
      >
        <img src={spriteUrl} alt="" crossorigin="anonymous" loading="lazy" width="30" height="30" />
      </span>
    {/if}
    <div class="item">
      {#snippet label()}
        <span>
          <span class:checked={completed}>{name}</span>
          {#if subtitle}<small>{subtitle}</small>{/if}
        </span>
      {/snippet}
      {#if covered}
        <Spoiler onReveal={() => (revealed = true)}>{@render label()}</Spoiler>
      {:else if placement.allSources.length > 0}
        <button
          class="item-name"
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onclick={() => (expanded = !expanded)}
        >
          {@render label()}
          <Icon.UI type="disclosure" class="size-3 {expanded ? 'rotate-90' : ''}" />
        </button>
      {:else}
        {@render label()}
      {/if}
    </div>
    {#each columns as column (column.id)}
      <span class="cell" aria-hidden="true">
        {#if placement.visibleSources.some((source) => toolbarState.showsSource(source) && ledgerSourceFamily(source) === column.id)}
          <Icon.Source type={column.type} class="size-4" />
        {/if}
      </span>
    {/each}
    {#if discovery}
      <span class="discovery">
        {#if placement.hiddenCount > 0 && !covered && !userState.state.showSpoilers}
          <button
            type="button"
            aria-expanded={expanded && revealSources}
            aria-controls={detailsId}
            onclick={() => {
              revealSources = !revealSources;
              expanded = true;
            }}
          >
            +{placement.hiddenCount} to discover
          </button>
        {/if}
      </span>
    {/if}
  </div>
  <div id={detailsId} hidden={!expanded} class="details">
    {#if expanded}
      {#if shelf === "notNow" && waitingSeasons.length > 0}
        {@const seasons = new Intl.ListFormat(lookups.locale).format(
          waitingSeasons.map((season) => seasonLabel(season, lookups.locale)),
        )}
        <p>Comes back by waiting, in {seasons}.</p>
      {/if}
      <SourceCard
        {sources}
        sourceSegments={sources.map((source) => buildSourceSegments(source, lookups))}
        sourceBadges={sources.map((source) =>
          "availability" in source && source.availability
            ? extractDisplayBadges(source.availability)
            : {},
        )}
      />
    {/if}
  </div>
</div>

<style>
  [data-ledger-row] {
    content-visibility: auto;
    contain-intrinsic-block-size: auto 48px;
    border-block-end: 1px solid var(--color-ink-hairline);
    border-inline-start: 2px solid transparent;
  }

  [data-highlighted="true"] {
    background: color-mix(in srgb, var(--color-guide-voice) 12%, var(--color-paper));
    border-inline-start-color: var(--color-guide-voice);
  }

  .line {
    display: flex;
    min-block-size: 48px;
    align-items: center;
    gap: 0.35rem;
  }

  .sprite {
    flex: none;
  }

  .item {
    min-inline-size: 0;
    flex: 1;
    font-size: var(--text-base);
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .item-name {
    display: inline-flex;
    min-block-size: 44px;
    align-items: center;
    gap: 0.35rem;
    text-align: start;
  }

  .item-name :global(svg) {
    flex: none;
    color: var(--color-guide-voice);
  }

  small {
    display: block;
    color: var(--color-ink-muted);
    font-size: var(--text-xs);
  }

  .checked {
    text-decoration: line-through;
  }

  .cell {
    display: none;
  }

  .discovery button {
    min-block-size: 44px;
    padding-inline: 0.25rem;
    color: var(--color-guide-voice);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }

  .details {
    padding: 0.5rem 0.75rem 0.75rem 2.75rem;
    background: var(--color-paper-sunken);
  }

  .details p {
    padding-block-end: 0.4rem;
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
  }

  @media (min-width: 60rem) {
    .cell {
      display: grid;
      inline-size: 6rem;
      flex: none;
      place-items: center;
      color: var(--color-ink-muted);
    }

    .discovery {
      inline-size: 8rem;
      flex: none;
      text-align: center;
    }
  }
</style>
