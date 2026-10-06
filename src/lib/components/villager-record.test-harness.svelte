<script lang="ts">
  import VillagerRecord from "#lib/components/villager-record.svelte";
  import { FeedbackContext, setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { Villager, VillagerId } from "#lib/types/tracker-data.js";

  let {
    compact = false,
    id,
    name,
    spoilered = false,
    villager,
  }: {
    compact?: boolean;
    id: VillagerId;
    name: string;
    spoilered?: boolean;
    villager: Villager;
  } = $props();

  setFeedbackContext(new FeedbackContext());
</script>

<ul>
  <VillagerRecord {compact} {id} {name} {spoilered} {villager} />
</ul>
