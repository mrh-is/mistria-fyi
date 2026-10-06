<script lang="ts">
  import ConfirmSpoilerDialog from "#lib/components/confirm-spoiler-dialog.svelte";

  import type { SpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";

  let { guard }: { guard: SpoilerGuard } = $props();
</script>

{#if guard.condition}
  <ConfirmSpoilerDialog
    bind:open={guard.open}
    condition={guard.condition}
    onCancel={() => {
      guard.cancel();
    }}
    onComplete={() => {
      guard.complete();
    }}
    onCompleteAndUpdate={() => {
      guard.completeAndUpdate();
    }}
  />
{/if}
