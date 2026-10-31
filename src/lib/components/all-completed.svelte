<script lang="ts">
  import { getCompletionScope } from "#lib/controllers/completion-scope.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  let { isAllCompleted }: { isAllCompleted: boolean } = $props();
  const completionScope = getCompletionScope();
</script>

{#if isAllCompleted && !userState.state.showCompleted && !completionScope}
  <p class="py-8 text-center text-base text-muted-foreground">{m.all_completed_message()}</p>
{/if}
