<script lang="ts">
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";

  const leaving = createLeavingSet<string>();
</script>

<button type="button" onclick={() => leaving.markLeaving("item")}>Complete item</button>
<p>{leaving.has("item") ? "Leaving" : "Absent"}</p>
