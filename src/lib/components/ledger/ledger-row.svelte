<script lang="ts">
  import { Icon, SOURCE_FILTER_ICON } from "#lib/components/icon/index.js";
  import LedgerSprite from "#lib/components/ledger/ledger-sprite.svelte";
  import SourceCard from "#lib/components/source-card.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import { extractDisplayBadges } from "#lib/engine/availability-condition.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { ledgerCellText, ledgerSourceFamily } from "#lib/presentation/ledger.js";
  import { buildSourceSegments } from "#lib/sources/source-segments.js";
  import { itemSpriteUrl } from "#lib/sprites/sprite-url.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { LedgerSpriteTreatment } from "#lib/components/ledger/ledger-sprite.svelte";
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
  // Once opened, the sheet keeps its sources, so it can slide shut over them.
  let opened = $state(false);
  $effect.pre(() => {
    if (expanded) opened = true;
  });
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
  let treatment = $derived.by((): LedgerSpriteTreatment => {
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
  /** Each timetable column's text: the first shown source in that family, in plain words. */
  let cells = $derived(
    columns.map((family) => {
      const source = placement.visibleSources.find(
        (candidate) =>
          toolbarState.showsSource(candidate) && ledgerSourceFamily(candidate) === family,
      );
      if (!source) return { family, present: false, text: undefined };
      const text = ledgerCellText(buildSourceSegments(source, lookups), (condition) =>
        isConditionVisible(condition, userState.progressionState),
      );
      return { family, present: true, text };
    }),
  );
  let opensSources = $derived(active && !covered && placement.allSources.length > 0);

  /** A click anywhere on the line opens the sources, except on its own controls. */
  function openFromLine(event: MouseEvent): void {
    if (!opensSources) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, label")) return;
    if (globalThis.getSelection()?.toString()) return;
    toggleSources(false);
  }
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
  data-ledger-fact={fact}
  data-highlighted={highlighted}
  data-source-state={expanded ? "open" : "closed"}
  style:--sprite-tint={`var(--color-category-${category})`}
  {@attach active ? feedback.reportableAttachment(reportable) : undefined}
>
  <!-- The name button is the keyboard path; the line only widens the pointer target. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="line" class:opens={opensSources} onclick={openFromLine}>
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
        <LedgerSprite name={nameWithVariant} url={spriteUrl} {treatment} />
      {:else}
        <span class="sprite" aria-hidden="true"></span>
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
    {#each cells as { family, text, present }, column (family)}
      {@const FamilyIcon = SOURCE_FILTER_ICON[family]}
      <span class="cell" class:first={column === 0} aria-hidden="true">
        {#if present}
          {#if text}{text}{:else}<FamilyIcon class="size-4" />{/if}
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
  {#if active}
    <!-- The sources are a second sheet under the row's, sliding out as the row opens. -->
    <div class="sheet" class:open={expanded}>
      <div class="sheet-clip">
        <div id={detailsId} class="details" inert={!expanded} aria-hidden={!expanded}>
          {#if expanded || opened}
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
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  [data-ledger-row] {
    content-visibility: auto;
    contain-intrinsic-block-size: auto var(--tracker-row-min-size);
    border-inline-start: 2px solid transparent;
    border-block-end: 1px solid var(--color-rule);
  }

  /* Many rows to a page: compact for a mouse, a full fingertip for touch. */
  @media (pointer: fine) and (hover: hover) {
    [data-ledger-row] {
      --tracker-target-size: 32px;
      --tracker-row-min-size: 36px;
    }
  }

  @media (any-pointer: coarse), (hover: none) {
    [data-ledger-row] {
      --tracker-target-size: 44px;
      --tracker-row-min-size: 44px;
    }
  }

  [data-highlighted="true"] {
    background: color-mix(in srgb, var(--primary) 9%, var(--color-paper));
    border-inline-start-color: var(--primary);
  }

  .line {
    display: grid;
    min-block-size: var(--tracker-row-min-size);
    align-items: center;
    column-gap: 0.35rem;
    grid-template-columns: var(--ledger-row-tracks, auto auto minmax(0, 1fr));
  }

  .line.opens {
    cursor: pointer;
  }

  .sprite {
    display: block;
    inline-size: 30px;
  }

  .item {
    min-inline-size: 0;
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

  .line.opens:hover .item-name > span {
    text-decoration: underline;
    text-decoration-color: var(--color-rule);
    text-underline-offset: 0.2em;
  }

  small {
    display: block;
    color: var(--color-ink-muted);
    font-size: var(--text-xs);
  }

  .checked {
    text-decoration: line-through;
  }

  .cell,
  .discovery {
    display: none;
  }

  /*
   * An open row is a sheet of the guide's raised paper, and its sources a sunken sheet beneath it,
   * inset under the name and rounded at the split, as the tracker rows had it.
   */
  [data-source-state="open"] > .line {
    position: relative;
    z-index: 1;
    border: 1px solid var(--color-rule);
    border-start-end-radius: var(--radius);
    border-end-end-radius: var(--radius);
    background: var(--color-paper-raised);
    filter: drop-shadow(var(--shadow-small));
  }

  [data-source-state="open"] {
    border-block-end-color: transparent;
  }

  .sheet {
    display: grid;
    grid-template-rows: 0fr;
    margin-inline-start: calc(var(--tracker-target-size) + 30px + 0.7rem);
    transition: grid-template-rows 260ms ease;
  }

  .sheet.open {
    grid-template-rows: 1fr;
  }

  .sheet-clip {
    min-block-size: 0;
    overflow: hidden;
  }

  .details {
    margin-block-end: 0.5rem;
    padding: 0.6rem 0.75rem 0.7rem;
    border: 1px solid var(--color-rule);
    border-block-start: 0;
    border-end-start-radius: var(--radius);
    border-end-end-radius: var(--radius);
    background:
      linear-gradient(
        to bottom,
        color-mix(in srgb, var(--color-ink) 7%, transparent),
        transparent 0.4rem
      ),
      var(--color-paper-sunken);
  }

  .details p {
    padding-block-end: 0.4rem;
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet {
      transition: none;
    }
  }

  @media (min-width: 60rem) {
    .cell {
      display: flex;
      align-self: stretch;
      align-items: center;
      padding-inline: 0.5rem;
      color: var(--color-ink-muted);
      font-family: var(--font-annotation);
      font-size: var(--text-xs);
      line-height: 1.25;
    }

    .cell.first {
      border-inline-start: 1px solid var(--color-rule-faint);
    }

    /* An aside, not a source: small & quiet beside the real columns. */
    .discovery {
      display: block;
      text-align: start;
    }

    .discovery button {
      max-inline-size: 6rem;
      min-block-size: var(--tracker-target-size);
      padding-inline: 0.25rem;
      color: var(--color-ink-muted);
      font-family: var(--font-annotation);
      font-size: var(--text-2xs);
      line-height: 1.2;
      text-align: start;
    }

    .discovery button:hover {
      color: var(--color-guide-voice);
    }
  }
</style>
