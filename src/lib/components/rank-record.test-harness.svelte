<script lang="ts">
  import RankRecord from "#lib/components/rank-record.svelte";
  import { FeedbackContext, setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { TownRank } from "#lib/types/tracker-data.js";

  let {
    color = "#123456",
    currentLevel,
    name = "",
    rank,
    spoilered = false,
  }: {
    color?: string;
    currentLevel: number;
    name?: string;
    rank: TownRank;
    spoilered?: boolean;
  } = $props();

  setFeedbackContext(new FeedbackContext());
</script>

<ul>
  <RankRecord {color} {currentLevel} {name} {rank} {spoilered} />
</ul>
