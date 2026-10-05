<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import type { QuestState } from "#lib/types/user-progress.js";

  interface Props {
    class?: string;
    state: QuestState;
  }

  let { class: className = "", state }: Props = $props();

  let shouldAnimate = $derived(!prefersReducedMotion.current);
</script>

<svg class={className} viewBox="0 0 28 28" fill="none" aria-hidden="true" filter="url(#pencil)">
  {#if state === "none"}
    <!-- Empty: faint dashed circle -->
    <circle
      cx="14"
      cy="14"
      r="10"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-dasharray="3 3"
      opacity="0.3"
    />
  {:else if state === "obtained"}
    <!-- Obtained: downslope stroke (top-left to bottom-right) -->
    <path d="M10 8 L18 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  {:else}
    <!-- Completed: downslope first, then upslope to form X -->
    <path d="M10 8 L18 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    <path
      d="M18 8 L10 20"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      class={shouldAnimate ? "animate-draw-stroke" : ""}
      stroke-dasharray={shouldAnimate ? "20" : "none"}
      stroke-dashoffset={shouldAnimate ? "20" : "0"}
    />
  {/if}
</svg>
