<script lang="ts">
  import * as m from "$lib/paraglide/messages.js";
  import { userState } from "$lib/stores/user-state.svelte";

  let { isAllCompleted }: { isAllCompleted: boolean } = $props();
</script>

{#if isAllCompleted && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">{m.all_completed_message()}</p>
{/if}
