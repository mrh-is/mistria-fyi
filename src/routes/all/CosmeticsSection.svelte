<script lang="ts">
  import CosmeticsContent from "$lib/components/cosmetics-content.svelte";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  const { progress }: { progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <div class="flex flex-col gap-1">
    <SectionHeader key="cosmetics" {progress} />
    <CosmeticsContent />
  </div>
{/if}
