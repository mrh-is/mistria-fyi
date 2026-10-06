<script lang="ts">
  import VillagerRecord from "#lib/components/villager-record.svelte";
  import { FeedbackContext, setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { Villager, VillagerId } from "#lib/types/tracker-data.js";

  let {
    compact = false,
    id,
    known = true,
    name,
    villager,
  }: {
    compact?: boolean;
    id: VillagerId;
    known?: boolean;
    name: string;
    villager: Villager;
  } = $props();

  setFeedbackContext(new FeedbackContext());
</script>

<ul>
  <VillagerRecord {compact} {id} {known} {name} {villager} />
</ul>
