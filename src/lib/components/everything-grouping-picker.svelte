<script lang="ts">
  import SegmentedPicker from "#lib/components/segmented-picker.svelte";
  import {
    readEverythingGrouping,
    selectEverythingGrouping,
  } from "#lib/controllers/everything-grouping.js";

  let grouping = $derived(readEverythingGrouping());
</script>

<div class="min-w-0 shrink-0">
  <SegmentedPicker
    choices={["source", "category"]}
    label="Group by"
    value={grouping}
    onSelect={selectEverythingGrouping}
  >
    {#snippet content(choice)}
      {choice === "source" ? "Place" : "Category"}
    {/snippet}
  </SegmentedPicker>
</div>
