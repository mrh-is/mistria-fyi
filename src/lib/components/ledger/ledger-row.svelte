<script lang="ts" module>
  import { MediaQuery } from "svelte/reactivity";

  /** Whether the timetable's source cells show; one query shared by every row. */
  const wideTable = new MediaQuery("min-width: 60rem", true);
</script>

<script lang="ts">
  import { Icon, SOURCE_FILTER_ICON } from "#lib/components/icon/index.js";
  import { getLedgerSectionContext } from "#lib/components/ledger/ledger-context.js";
  import LedgerSprite from "#lib/components/ledger/ledger-sprite.svelte";
  import SourceCard from "#lib/components/source-card.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { sourceFilterLabel } from "#lib/data/source-filters.js";
  import { extractDisplayBadges } from "#lib/engine/availability-condition.js";
  import { isSourceDoable, isSourceVisible } from "#lib/engine/availability.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import {
    ledgerCellText,
    ledgerColumn,
    ledgerFirstPlace,
    ledgerSourceFamily,
  } from "#lib/presentation/ledger.js";
  import { sourcePlaceName } from "#lib/presentation/source-labels.js";
  import { buildSourceSegments } from "#lib/sources/source-segments.js";
  import { itemSpriteUrl } from "#lib/sprites/sprite-url.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { LedgerSpriteTreatment } from "#lib/components/ledger/ledger-sprite.svelte";
  import type { CheckboxState } from "#lib/components/tracker-checkbox.svelte";
  import type { CategoryKey } from "#lib/engine/categories.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { ReportCategory } from "#lib/feedback/types.js";
  import type { LedgerColumn, LedgerPlacement } from "#lib/presentation/ledger.js";
  import type { SegmentLookups } from "#lib/sources/source-segments.js";
  import type { Source } from "#lib/types/acquisition.js";
  import type { Season } from "#lib/types/tracker-data.js";

  let {
    active = true,
    category,
    columns,
    completed,
    disabled = false,
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
    searchMiss = false,
    shelf,
    sprite,
    subtitle,
    variant,
  }: {
    active?: boolean;
    category: CategoryKey;
    columns: readonly LedgerColumn[];
    completed: boolean;
    disabled?: boolean;
    discovery: boolean;
    fact: string;
    highlighted: boolean;
    id: string;
    lookups: SegmentLookups;
    name: string;
    obtained?: boolean;
    onFind?: (event: Event) => void;
    onToggle: (covered: boolean) => void;
    /** The row's placement in its section, keyed as the section mounts it. */
    placement: LedgerPlacement & { key: string };
    reportCategory: ReportCategory;
    searchMiss?: boolean;
    shelf: Shelf;
    sprite?: string;
    subtitle?: string;
    variant?: string;
  } = $props();

  const feedback = getFeedbackContext();
  const section = getLedgerSectionContext();
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
    columns.map((column) => {
      const source = placement.visibleSources.find(
        (candidate) =>
          toolbarState.showsSource(candidate) &&
          ledgerColumn(candidate, section?.categoryDetails ?? false) === column,
      );
      return { column, source, text: source ? timetableText(source) : undefined };
    }),
  );

  function cellText(source: Source): string | undefined {
    return ledgerCellText(buildSourceSegments(source, lookups), (condition) =>
      isConditionVisible(condition, userState.progressionState),
    );
  }

  function timetableText(source: Source): string | undefined {
    const text = cellText(source);
    if (!text || !section?.categoryDetails) return text;
    if (source.type === "recipe" || source.type === "museum_donation") {
      return sourcePlaceName(source, lookups);
    }
    if (source.type === "scroll_bundle") return lookups.itemNames[source.bundleItemId];
    if ("cost" in source) return formatNumber(source.cost, lookups.locale);
    return text;
  }

  function namedPlace(source: Source): string | undefined {
    if (!isSourceVisible(source, userState.progressionState)) return undefined;
    return sourcePlaceName(source, lookups);
  }

  function availableToday(source: Source): boolean {
    return isSourceDoable(source, userState.progressContext);
  }

  /*
   * No row goes without a source in view. Where the timetable shows, a row whose cells are all
   * blank names its first source's family beside the name; where it doesn't, the first source sits
   * under the name. A place's own family is skipped, since its heading already says it.
   */
  let firstSource = $derived(
    placement.visibleSources.find(
      (source) =>
        toolbarState.showsSource(source) &&
        ledgerSourceFamily(source) !== section?.contextualFamily,
    ),
  );
  let tableShown = $derived(wideTable.current && columns.length > 0);
  let blank = $derived(cells.every(({ source }) => !source));
  let firstFamily = $derived(firstSource ? ledgerSourceFamily(firstSource) : undefined);
  let phonePlace = $derived.by(() => {
    if (tableShown || !section?.categoryDetails || covered) return undefined;
    return (
      ledgerFirstPlace(sources, availableToday, namedPlace) ??
      ledgerFirstPlace(
        placement.visibleSources.filter(toolbarState.showsSource),
        availableToday,
        cellText,
      )
    );
  });
  let recipeOrigins = $derived(
    section?.categoryDetails
      ? [
          ...new Set(
            sources.flatMap((source) => {
              if (source.type !== "recipe") return [];
              const recipe = trackerData.recipes[source.recipeId];
              if (!isConditionVisible(recipe.visibility, userState.progressionState)) return [];
              return recipe.sources.flatMap((origin) =>
                isSourceVisible(origin, userState.progressionState)
                  ? (namedPlace(origin) ?? cellText(origin) ?? [])
                  : [],
              );
            }),
          ),
        ]
      : [],
  );

  /*
   * The opened sheet holds what the cells can't: sources without a column, ones with seasons or
   * other badges, & sources still to discover. A source its cell already prints isn't repeated.
   */
  let inCells = $derived.by(() => {
    // A cell whose words are behind a spoiler prints only an icon, so its source stays in the sheet.
    if (tableShown) {
      return new Set(
        cells.flatMap(({ source, text }) =>
          source && text && text === cellText(source) ? [source] : [],
        ),
      );
    }
    if (section?.categoryDetails) return new Set<Source>();
    // Without the table, the line under the name prints the first source.
    // A source whose words are still behind a spoiler shows only its family there, so it stays.
    return new Set(firstSource && cellText(firstSource) ? [firstSource] : []);
  });
  function badgesOf(source: Source) {
    return "availability" in source && source.availability
      ? extractDisplayBadges(source.availability)
      : {};
  }
  function sheetHolds(source: Source): boolean {
    return !inCells.has(source) || Object.values(badgesOf(source)).some(Boolean);
  }
  let sheetSources = $derived(sources.filter((source) => sheetHolds(source)));
  let waits = $derived(shelf === "notNow" && waitingSeasons.length > 0);
  /*
   * Whether the row opens is decided by what's in view, not by sources a “+N to discover” press
   * revealed; those open & close from that button.
   */
  let sheetHasContent = $derived(
    placement.visibleSources.some(
      (source) => toolbarState.showsSource(source) && sheetHolds(source),
    ) ||
      waits ||
      recipeOrigins.length > 0,
  );
  let opensSources = $derived(
    active && !covered && placement.allSources.length > 0 && sheetHasContent,
  );

  // A row that stops having anything to open (a wider window, a filter) closes, so it can't stick.
  $effect(() => {
    if (expanded && !revealSources && !opensSources) expanded = false;
  });

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
  data-ledger-key={placement.key}
  data-ledger-search-miss={searchMiss || undefined}
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
        {disabled}
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
      {#if spriteUrl && !covered}
        <LedgerSprite name={nameWithVariant} url={spriteUrl} {treatment} />
      {:else}
        <span class="sprite" aria-hidden="true"></span>
      {/if}
    {/if}
    <div class="item">
      {#snippet label()}
        <!-- The variant follows the name on its line, and wraps as a unit only when it must. -->
        <span>
          <span class:checked={completed}>{name}</span>
          {#if subtitle}<small>{subtitle}</small>{/if}
        </span>
      {/snippet}
      {#if covered}
        {#if active}<Spoiler onReveal={() => (revealed = true)}>{@render label()}</Spoiler>{/if}
      {:else if opensSources || (!active && placement.allSources.length > 0)}
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
              class="item-chevron size-3 {expanded ? 'rotate-90' : ''}"
            />{/if}
        </button>
      {:else}
        {@render label()}
      {/if}
      {#if !covered && phonePlace}
        <span class="where place">
          <Icon.Source type={phonePlace.source.type} class="size-3.5 shrink-0" />{phonePlace.name}
        </span>
      {:else if !covered && firstSource && (tableShown || !section?.categoryDetails)}
        {@const text = cellText(firstSource)}
        {#if !tableShown && (text || firstFamily)}
          <span class="where"
            >{text ?? (firstFamily ? sourceFilterLabel(firstFamily, lookups.locale) : "")}</span
          >
        {:else if tableShown && blank && firstFamily}
          {@const FamilyIcon = SOURCE_FILTER_ICON[firstFamily]}
          <span class="also"
            ><FamilyIcon class="size-3.5 shrink-0" />{sourceFilterLabel(
              firstFamily,
              lookups.locale,
            )}</span
          >
        {:else if tableShown && blank && text}
          <span class="where">{text}</span>
        {/if}
      {/if}
    </div>
    {#each cells as { column, text }, i (column)}
      <span class="cell" class:first={i === 0} aria-hidden="true">
        {text}
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
            {#if waits}
              {@const seasons = new Intl.ListFormat(lookups.locale).format(
                waitingSeasons.map((season) => waitingSeasonPhrase(season)),
              )}
              <p>Comes back by waiting, {seasons}.</p>
            {/if}
            {#if sheetSources.length > 0}
              <SourceCard
                sources={sheetSources}
                sourceSegments={sheetSources.map((source) => buildSourceSegments(source, lookups))}
                sourceBadges={sheetSources.map((source) => badgesOf(source))}
              />
            {/if}
            {#if recipeOrigins.length > 0}
              {@const origins = new Intl.ListFormat(lookups.locale).format(recipeOrigins)}
              <p class="recipe-origin">Learned from {origins}</p>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /*
   * No content-visibility: a row mounted above the screen would take its placeholder height, then
   * grow on its first paint. WebKit's scroll anchoring doesn't absorb that growth, so scrolling up
   * drifted by up to 151 px. The row window bounds the rows mounted, so skipping paint saves little.
   */
  [data-ledger-row] {
    border-inline-start: 2px solid transparent;
    border-block-end: 1px solid var(--color-rule);
  }

  /*
   * Many rows to a page: compact for a mouse, a full fingertip for touch. The row window's spacer
   * estimate (`--ledger-row-pixels` in ledger-section.svelte) is each size plus the 1px rule.
   */
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
    position: relative;
    cursor: pointer;
  }

  /*
   * On a phone, a folded corner at the row's end says a tap opens it, as production's rows did; the
   * small arrow stays for wider screens. It unfolds as the sheet slides out.
   */
  @media (max-width: 47.99rem) {
    .line.opens::after {
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 0;
      inline-size: 0.75rem;
      block-size: 0.75rem;
      background: linear-gradient(
        to bottom left,
        var(--color-paper) 50%,
        color-mix(in srgb, var(--color-rule) 70%, var(--color-paper-sunken)) 50%
      );
      filter: drop-shadow(var(--shadow-small));
      content: "";
      pointer-events: none;
      transition: opacity 160ms ease;
    }

    :global(:dir(rtl)) .line.opens::after {
      background: linear-gradient(
        to bottom right,
        var(--color-paper) 50%,
        color-mix(in srgb, var(--color-rule) 70%, var(--color-paper-sunken)) 50%
      );
    }

    [data-source-state="open"] > .line.opens::after {
      opacity: 0;
    }

    .item-name :global(.item-chevron) {
      display: none;
    }
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

  /* An inline-block wraps whole: it drops below the name only when the line has no room. */
  small {
    display: inline-block;
    margin-inline-start: 0.4em;
    color: var(--color-ink-muted);
    font-size: var(--text-xs);
  }

  /* Where to get it, for a row whose source cells are hidden or blank. */
  .where {
    display: block;
    padding-block-end: 0.3rem;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.25;
  }

  .place {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .recipe-origin {
    margin-block-start: 0.25rem;
    font-family: var(--font-annotation);
  }

  .also {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-inline-start: 0.6rem;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    vertical-align: middle;
  }

  /*
   * A spoilered row is an unlogged entry: a ruled blank where the name goes, the same length for
   * every row, so neither a grey bar nor its width hints at the name.
   */
  .item :global(.spoiler-cover__mask) {
    display: inline-block;
    inline-size: 7rem;
    block-size: 1.1em;
    border-block-end: 1px solid var(--color-rule);
    border-radius: 0;
    background: none;
    vertical-align: middle;
  }

  .item :global(.spoiler-cover__content) {
    display: none;
  }

  .item :global(.spoiler-cover:is(:hover, :focus-visible) .spoiler-cover__mask) {
    border-block-end-color: var(--color-ink-muted);
    background: color-mix(in srgb, var(--color-ink) 5%, transparent);
  }

  /* The row's most used control takes the page's own focus ring, like every other control. */
  .line :global(.tracker-checkbox:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
    box-shadow: none;
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
