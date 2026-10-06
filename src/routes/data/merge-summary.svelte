<script lang="ts">
  import { getName } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import {
    formatMergeCount,
    MERGE_COUNT_LABELS,
    totalMergeCounts,
  } from "#lib/presentation/merge-labels.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  import type { MergeCountKey } from "#lib/presentation/merge-labels.js";
  import type { VillagerRelationship } from "#lib/types/tracker-data.js";
  import type { ChildChoice, MergeConflict, MergeCounts } from "#lib/types/user-progress.js";

  let {
    conflicts = [],
    counts,
    filesUsed = [],
    kind,
  }: {
    conflicts?: MergeConflict[];
    counts: MergeCounts;
    filesUsed?: string[];
    kind: "import" | "transfer";
  } = $props();

  let total = $derived(totalMergeCounts(counts));

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

{#if total > 0}
  <p class="text-base font-medium text-green-800 dark:text-green-200">
    {kind === "import"
      ? m.merge_imported_from({ files: filesUsed.join(", ") })
      : m.merge_transferred_items({ count: total })}
  </p>
  <ul class="mt-1 space-y-0.5 text-sm text-muted-foreground">
    {#each Object.keys(MERGE_COUNT_LABELS) as key (key)}
      {@const text = formatMergeCount(key as MergeCountKey, counts[key as MergeCountKey])}
      {#if text}
        <li>{text}</li>
      {/if}
    {/each}
  </ul>
{:else}
  <p class="text-base font-medium text-green-800 dark:text-green-200">
    {kind === "import" ? m.data_no_new_data_import() : m.merge_qr_no_new_items()}
  </p>
{/if}

{#if conflicts.length > 0}
  <ul class="mt-2 space-y-1.5 border-t border-amber-200 pt-2 text-sm dark:border-amber-800">
    {#each conflicts as conflict, index (index)}
      <li class="text-amber-900 dark:text-amber-200">
        {conflictMessage(conflict)}
        <a class="underline" href={localizedHref("villagers")}>
          {m.merge_conflict_correction_link()}
        </a>
      </li>
    {/each}
  </ul>
{/if}
