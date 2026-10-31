<script lang="ts">
  import { registerCompletionSection } from "#lib/controllers/completion-scope.svelte.js";

  import type { Snippet } from "svelte";

  let { children, complete }: { children: Snippet; complete: boolean } = $props();
  const section = registerCompletionSection(() => complete);
</script>

{#if section.visible}
  {@render children()}
{/if}
