<script lang="ts">
  import FoldoutPanel from "#lib/components/foldout-panel.svelte";
  import { localizedHref } from "#lib/utils/localized-href.js";

  let {
    isModal = true,
    onClose,
    withHeaderAction = false,
  }: { isModal?: boolean; onClose: () => void; withHeaderAction?: boolean } = $props();
</script>

<button type="button">Outside before</button>
<FoldoutPanel id="harness-panel" {isModal} title="Harness" {onClose}>
  {#snippet headerActions()}
    {#if withHeaderAction}
      <button type="button">Header action</button>
    {/if}
  {/snippet}
  <button type="button">First</button>
  <a href={localizedHref("about")}>Middle</a>
  <button type="button">Last</button>
</FoldoutPanel>
<button type="button">Outside after</button>
