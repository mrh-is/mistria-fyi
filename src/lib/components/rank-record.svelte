<script lang="ts">
  import IconCompletion from "#lib/components/icon/icon-completion.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import Spoiler from "#lib/components/spoiler.svelte";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { getRankState } from "#lib/presentation/renown-presentation.js";
  import { page } from "$app/state";

  import type { TownRank } from "#lib/types/tracker-data.js";

  let {
    color,
    currentLevel,
    name = "",
    rank,
    spoilered = false,
  }: {
    color: string;
    currentLevel: number;
    name?: string;
    rank: TownRank;
    spoilered?: boolean;
  } = $props();

  let rankState = $derived(getRankState(currentLevel, rank));
  let rankLevelSpan = $derived(Math.max(rank.levels.end - rank.levels.start + 1, 1));
  let levelsIntoRank = $derived(Math.max(currentLevel - rank.levels.start, 0));
  let fillPercent = $derived.by(() => {
    if (rankState === "completed") return 100;
    if (rankState === "upcoming") return 0;
    if (rankLevelSpan === 1 && currentLevel >= rank.levels.end) return 100;
    return Math.min((levelsIntoRank / rankLevelSpan) * 100, 100);
  });
  let revealed = $state(false);
  let isRedacted = $derived(spoilered && !revealed);
  const feedbackContext = getFeedbackContext();
  let reportable = $derived(
    feedbackContext.reportableAttachment({
      category: "rank",
      displayName: isRedacted ? m.tracker_row_spoilered_item() : name,
      page: page.url.pathname,
    }),
  );
</script>

<li
  class="rank-record"
  {@attach reportable}
  data-rank-record
  data-rank-state={rankState}
  style="--town-rank-color: {color}"
>
  <span class="rank-mark" aria-hidden="true">
    <Icon.ProgressMark type="town_rank" stroke={1.5} />
    {#if fillPercent > 0}
      <span data-testid="rank-fill" style="clip-path: inset(0 {100 - fillPercent}% 0 0)">
        <Icon.ProgressMark type="town_rank" fill={color} stroke={1.5} />
      </span>
    {/if}
  </span>

  <span class="rank-copy">
    <strong>
      {#if isRedacted}
        <Spoiler onReveal={() => (revealed = true)}>{name}</Spoiler>
      {:else}
        {name}
      {/if}
    </strong>
    <small>
      {#if rank.levels.start === rank.levels.end}
        {m.rank_level_single({ level: rank.levels.start })}
      {:else}
        {m.rank_level_range({ start: rank.levels.start, end: rank.levels.end })}
      {/if}
    </small>
  </span>

  {#if rankState === "completed"}
    <span class="rank-state rank-state--completed">
      <IconCompletion state="completed" class="rank-completion" />
      {m.rank_state_completed()}
    </span>
  {:else if rankState === "current"}
    <span class="rank-state"
      ><strong>{m.rank_state_current()}</strong> {levelsIntoRank} / {rankLevelSpan}</span
    >
  {:else}
    <span class="rank-state">{m.rank_state_upcoming()}</span>
  {/if}
</li>

<style>
  .rank-record {
    display: grid;
    min-width: 0;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid var(--color-ink-hairline);
    border-bottom: 0;
    background: var(--color-paper-raised);
    color: var(--color-ink-muted);
  }

  .rank-record:first-child {
    border-radius: var(--radius) var(--radius) 0 0;
  }

  .rank-record:last-child {
    border-bottom: 1px solid var(--color-ink-hairline);
    border-radius: 0 0 var(--radius) var(--radius);
  }

  .rank-mark {
    position: relative;
    display: block;
    width: 28px;
    height: 28px;
    color: color-mix(in srgb, var(--color-ink-muted) 55%, transparent);
  }

  .rank-mark > :global(svg),
  .rank-mark > span,
  .rank-mark > span :global(svg) {
    position: absolute;
    inset: 0;
    width: 28px;
    height: 28px;
  }

  .rank-mark > span {
    overflow: hidden;
    color: var(--town-rank-color);
  }

  .rank-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .rank-copy strong {
    position: relative;
    width: fit-content;
    max-width: 100%;
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 650;
  }

  .rank-copy small,
  .rank-state {
    font-family: var(--font-data);
    font-size: var(--text-3xs);
  }

  .rank-state {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .rank-state :global(.rank-completion) {
    width: 17px;
    height: 17px;
    color: var(--color-category-renown);
  }

  .rank-record[data-rank-state="completed"] .rank-copy strong {
    text-decoration: line-through;
  }

  .rank-record[data-rank-state="current"] {
    position: relative;
    z-index: 1;
    color: var(--color-ink);
    /* stylelint-disable-next-line declaration-property-unit-disallowed-list -- an inset edge marker, not an elevation */
    box-shadow: inset 3px 0 0 var(--color-category-renown);
  }

  .rank-record[data-rank-state="current"] .rank-copy strong::after {
    position: absolute;
    right: -5px;
    bottom: 0;
    left: -3px;
    z-index: -1;
    height: 45%;
    background: color-mix(in srgb, var(--color-category-renown) 18%, transparent);
    content: "";
    transform: rotate(-0.6deg);
  }

  @media (max-width: 380px) {
    .rank-record {
      grid-template-columns: 28px minmax(0, 1fr);
    }

    .rank-state {
      grid-column: 2;
    }
  }
</style>
