<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    class?: string;
  }

  const { children, class: cls = "" }: Props = $props();
</script>

<!-- Ensures 44px minimum touch target for icon-only interactive elements -->
<span class="flex min-h-11 min-w-11 items-center justify-center {cls}">
  {@render children()}
</span>
