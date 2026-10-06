<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import TrackerPaper from "#lib/components/tracker-paper.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { MAX_HEART_LEVEL } from "#lib/engine/progress.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import type { VillagerId } from "#lib/types/tracker-data.js";

  // Hearts aren't binary, so a villager result links to its record instead of offering a toggle.
  let { completed, id, name }: { completed: boolean; id: VillagerId; name: string } = $props();

  let level = $derived(userState.state.completed.heartLevels[id] ?? 0);
</script>

<div
  data-tracker-row
  class="villager-search-result"
  class:villager-search-result--completed={completed}
>
  <TrackerPaper hasCutout={false}>
    <a
      class="villager-search-result__link"
      href="{localizedHref('villagers')}#villager-{id}"
      aria-label={m.villager_relationship_level_aria({ level, max: MAX_HEART_LEVEL, name })}
    >
      <span class="villager-search-result__mark" aria-hidden="true">
        <Icon.ProgressMark
          type={trackerData.villagers[id].dateable
            ? "relationship_dateable"
            : "relationship_platonic"}
        />
      </span>
      <span class="villager-search-result__name">{name}</span>
      <span class="villager-search-result__level" aria-hidden="true">
        {level}/{MAX_HEART_LEVEL}
      </span>
    </a>
  </TrackerPaper>
</div>

<style>
  .villager-search-result {
    /* A lone card, so every corner is rounded; TrackerRow declares the same singleton state. */
    --tracker-paper-border-start-width: var(--tracker-paper-border-width);
    --tracker-paper-start-start-radius: var(--tracker-paper-radius);
    --tracker-paper-start-end-radius: var(--tracker-paper-radius);
    --tracker-paper-end-start-radius: var(--tracker-paper-radius);
    --tracker-paper-end-end-radius: var(--tracker-paper-radius);

    position: relative;
  }

  .villager-search-result--completed {
    color: var(--color-ink-muted);
  }

  .villager-search-result__link {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    align-self: stretch;
    gap: var(--tracker-row-gap);
    color: inherit;
    text-decoration: none;
  }

  .villager-search-result__link:hover .villager-search-result__name {
    text-decoration: underline;
  }

  .villager-search-result__mark {
    display: inline-flex;
    inline-size: var(--tracker-target-size);
    flex-shrink: 0;
    justify-content: center;
    color: var(--color-ink-muted);
  }

  .villager-search-result__name {
    min-width: 0;
    flex: 1;
    font-size: var(--text-base);
    line-height: 1.3;
  }

  .villager-search-result__level {
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    color: var(--color-ink-muted);
  }
</style>
