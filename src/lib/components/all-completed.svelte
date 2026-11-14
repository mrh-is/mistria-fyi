<script lang="ts">
  import { getCompletionScope } from "#lib/controllers/completion-scope.svelte.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

  let { isAllCompleted }: { isAllCompleted: boolean } = $props();
  const completionScope = getCompletionScope();
</script>

{#if isAllCompleted && !completionScope && !toolbarState.searchQuery}
  <p class="py-8 text-center text-base text-muted-foreground">
    You’re all done! You can admire everything under Completed.
  </p>
{/if}
