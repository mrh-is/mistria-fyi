<script lang="ts">
  import * as m from "#lib/paraglide/messages.js";

  // The note shown where a tracker section has nothing to list.
  let { message = m.no_items_match_filters() }: { message?: string } = $props();
</script>

<p class="py-4 text-center text-sm text-muted-foreground" data-tracker-empty>{message}</p>
