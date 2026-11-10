<script lang="ts">
  import { getName } from "#lib/data/names.js";
  import { getAllProgress, getOverallProgress } from "#lib/engine/categories.js";
  import {
    formatMergeCount,
    MERGE_COUNT_LABELS,
    totalMergeCounts,
  } from "#lib/presentation/merge-labels.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import * as m from "#lib/ui-messages/messages.js";
  import { formatNumber, formatPercent } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  import type { MergeCountKey } from "#lib/presentation/merge-labels.js";
  import type { VillagerRelationship } from "#lib/types/tracker-data.js";
  import type { ChildChoice, MergeConflict, MergeCounts } from "#lib/types/user-progress.js";

  let {
    conflicts = [],
    counts,
    filesUsed = [],
  }: {
    conflicts?: MergeConflict[];
    counts: MergeCounts;
    filesUsed?: string[];
  } = $props();

  let total = $derived(totalMergeCounts(counts));
  let overall = $derived(getOverallProgress(getAllProgress(userState.progressContext)));
  let percent = $derived(
    overall.total > 0 ? Math.round((overall.completed / overall.total) * 100) : 0,
  );

  function childChoiceLabel(choice: Exclude<ChildChoice, "undeclared">): string {
    return choice === "yes" ? m.relationship_action_yes() : m.relationship_action_no();
  }

  function conflictMessage(conflict: MergeConflict): string {
    switch (conflict.kind) {
      case "childChoice":
        return m.merge_conflict_child_choice({
          incoming: childChoiceLabel(conflict.incomingChildChoice),
          local: childChoiceLabel(conflict.localChildChoice),
          villager: getName("villagers", conflict.villagerId, page.data.locale),
        });
      case "relationship":
        return m.merge_conflict_relationship({
          incoming: relationshipLabel(
            conflict.incomingRelationship as Exclude<VillagerRelationship, "undecided">,
          ),
          local: relationshipLabel(
            conflict.localRelationship as Exclude<VillagerRelationship, "undecided">,
          ),
          villager: getName("villagers", conflict.villagerId, page.data.locale),
        });
      case "spouse":
        return m.merge_conflict_spouse({
          incomingVillager: getName("villagers", conflict.incomingVillagerId, page.data.locale),
          localVillager: getName("villagers", conflict.localVillagerId, page.data.locale),
        });
    }
  }

  function relationshipLabel(relationship: Exclude<VillagerRelationship, "undecided">): string {
    switch (relationship) {
      case "married":
        return getName("ui", "married", page.data.locale);
      case "platonic":
        return getName("ui", "best_friend", page.data.locale);
      case "proposed":
        return getName("ui", "engaged", page.data.locale);
      case "romantic":
        return getName("ui", "dating", page.data.locale);
    }
  }
</script>

<p class="text-base font-medium">
  {m.merge_overall_outcome({
    percent: formatPercent(percent, page.data.locale),
    remaining: formatNumber(overall.total - overall.completed, page.data.locale),
  })}
</p>

{#if total > 0}
  <details class="mt-2 text-sm">
    <summary class="cursor-pointer">{m.merge_changes_details()}</summary>
    {#if filesUsed.length > 0}
      <p class="mt-1 break-words text-muted-foreground">
        {m.merge_imported_from({ files: filesUsed.join(", ") })}
      </p>
    {/if}
    <ul class="mt-1 space-y-0.5 text-muted-foreground">
      {#each Object.keys(MERGE_COUNT_LABELS) as key (key)}
        {@const text = formatMergeCount(
          key as MergeCountKey,
          counts[key as MergeCountKey],
          page.data.locale,
        )}
        {#if text}
          <li>{text}</li>
        {/if}
      {/each}
    </ul>
  </details>
{:else}
  <p class="text-base font-medium">
    {m.data_no_new_data_import()}
  </p>
{/if}

{#if conflicts.length > 0}
  <ul class="mt-2 space-y-1.5 border-t border-(--color-status-warning)/40 pt-2 text-sm">
    {#each conflicts as conflict, index (index)}
      <li class="text-foreground">
        {conflictMessage(conflict)}
        <a class="underline" href={localizedHref("villagers")}>
          {m.merge_conflict_correction_link()}
        </a>
      </li>
    {/each}
  </ul>
{/if}
