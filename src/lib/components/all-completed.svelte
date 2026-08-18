<script lang="ts">
  import { userState } from "$lib/stores/user-state.svelte";

  let { isAllCompleted }: { isAllCompleted: boolean } = $props();
</script>

{#if isAllCompleted && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
