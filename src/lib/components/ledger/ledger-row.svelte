<script lang="ts">
  import { ledgerSpriteMask } from "#lib/attachments/ledger-sprite-mask.js";
  import { Icon, SOURCE_FILTER_ICON } from "#lib/components/icon/index.js";
  import SourceCard from "#lib/components/source-card.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import { extractDisplayBadges } from "#lib/engine/availability-condition.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { ledgerSourceFamily } from "#lib/presentation/ledger.js";
  import { buildSourceSegments } from "#lib/sources/source-segments.js";
  import { itemSpriteUrl } from "#lib/sprites/sprite-url.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { CheckboxState } from "#lib/components/tracker-checkbox.svelte";
  import type { SourceFilterId } from "#lib/data/source-filters.js";
  import type { CategoryKey } from "#lib/engine/categories.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { ReportCategory } from "#lib/feedback/types.js";
  import type { LedgerPlacement } from "#lib/presentation/ledger.js";
  import type { SegmentLookups } from "#lib/sources/source-segments.js";
  import type { Season } from "#lib/types/tracker-data.js";

  let {
    active = true,
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
    onFind,
    onToggle,
    placement,
    reportCategory,
    shelf,
    sprite,
    subtitle,
    variant,
  }: {
    active?: boolean;
    category: CategoryKey;
    columns: readonly SourceFilterId[];
    completed: boolean;
    discovery: boolean;
    fact: string;
    highlighted: boolean;
    id: string;
    lookups: SegmentLookups;
    name: string;
    obtained?: boolean;
    onFind?: (event: Event) => void;
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

  function toggleSources(includeHidden: boolean): void {
    const opening = includeHidden ? !(expanded && revealSources) : !expanded;
    revealSources = opening && includeHidden;
    expanded = opening;
  }
  let covered = $derived(
    placement.spoilered && !(active && revealed) && !userState.state.showSpoilers,
  );
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
    if (completed) return "checked";
    if (covered) return "unchecked";
    return obtained ? "obtained" : "unchecked";
  });
  let reportable = $derived(
    covered
      ? { category: reportCategory, displayName: "Spoilered item", page: page.url.pathname }
      : { category: reportCategory, displayName: name, entityId: id, page: page.url.pathname },
  );

  function waitingSeasonPhrase(season: Season): string {
    switch (season) {
      case "spring":
        return /* @wc-include */ "in spring";
      case "summer":
        return /* @wc-include */ "in summer";
      case "fall":
        return /* @wc-include */ "in fall";
      case "winter":
        return /* @wc-include */ "in winter";
    }
  }
</script>

<div
  data-tracker-row={active || undefined}
  data-ledger-row={active || undefined}
  hidden={active ? undefined : "until-found"}
  onbeforematch={onFind}
  data-highlighted={highlighted}
  data-source-state={expanded ? "open" : "closed"}
  style:--sprite-tint={`var(--color-category-${category})`}
  {@attach active ? feedback.reportableAttachment(reportable) : undefined}
>
  <div class="line">
    {#if active}
      <TrackerCheckbox
        {fact}
        provenance={userState.provenanceOf(fact)}
        state={checkState}
        label={covered
          ? completed
            ? "Uncheck spoilered item"
            : "Check spoilered item"
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
          <img
            src={spriteUrl}
            alt=""
            crossorigin="anonymous"
            loading="lazy"
            width="30"
            height="30"
          />
        </span>
      {/if}
    {/if}
    <div class="item">
      {#snippet label()}
        <span>
          <span class:checked={completed}>{name}</span>
          {#if subtitle}<small>{subtitle}</small>{/if}
        </span>
      {/snippet}
      {#if covered}
        {#if active}<Spoiler onReveal={() => (revealed = true)}>{@render label()}</Spoiler>{/if}
      {:else if placement.allSources.length > 0}
        <button
          class="item-name"
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onclick={() => toggleSources(false)}
        >
          {@render label()}
          {#if active}<Icon.UI
              type="disclosure"
              class="size-3 {expanded ? 'rotate-90' : ''}"
            />{/if}
        </button>
      {:else}
        {@render label()}
      {/if}
    </div>
    {#each columns as family (family)}
      {@const FamilyIcon = SOURCE_FILTER_ICON[family]}
      <span class="cell" aria-hidden="true">
        {#if placement.visibleSources.some((source) => toolbarState.showsSource(source) && ledgerSourceFamily(source) === family)}
          <FamilyIcon class="size-4" />
        {/if}
      </span>
    {/each}
    {#if discovery}
      <span class="discovery">
        {#if placement.hiddenCount > 0 && !covered && !userState.state.showSpoilers}
          {@const count = formatNumber(placement.hiddenCount, lookups.locale)}
          <button
            type="button"
            aria-expanded={expanded && revealSources}
            aria-controls={detailsId}
            onclick={() => toggleSources(true)}
          >
            {plural(placement.hiddenCount, [`+${count} to discover`, `+${count} to discover`])}
          </button>
        {/if}
      </span>
    {/if}
  </div>
  {#if active}<div id={detailsId} hidden={!expanded} class="details">
      {#if expanded}
        {#if shelf === "notNow" && waitingSeasons.length > 0}
          {@const seasons = new Intl.ListFormat(lookups.locale).format(
            waitingSeasons.map((season) => waitingSeasonPhrase(season)),
          )}
          <p>Comes back by waiting, {seasons}.</p>
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
    </div>{/if}
</div>

<style>
  [data-ledger-row] {
    content-visibility: auto;
    contain-intrinsic-block-size: auto var(--tracker-row-min-size);
    border-block-end: 1px solid var(--color-ink-hairline);
    border-inline-start: 2px solid transparent;
  }

  [data-highlighted="true"] {
    background: color-mix(in srgb, var(--color-guide-voice) 12%, var(--color-paper));
    border-inline-start-color: var(--color-guide-voice);
  }

  .line {
    display: flex;
    min-block-size: var(--tracker-row-min-size);
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
    min-block-size: var(--tracker-target-size);
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
    min-block-size: var(--tracker-target-size);
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
