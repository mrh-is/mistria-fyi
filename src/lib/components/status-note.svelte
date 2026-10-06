<script lang="ts">
  import type { Snippet } from "svelte";

  export type StatusNoteTone = "error" | "success" | "warning";

  let {
    children,
    class: className = "",
    tone,
  }: { children: Snippet; class?: string; tone: StatusNoteTone } = $props();
</script>

<!-- Errors & warnings interrupt; a success note is read in place. -->
<div
  class="status-note status-note--{tone} {className}"
  role={tone === "success" ? undefined : "alert"}
>
  {@render children()}
</div>

<style>
  .status-note {
    --status-note-hue: var(--fg-green);

    padding: 0.75rem;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--status-note-hue) 10%, var(--paper));
    color: var(--ink);
  }

  .status-note--error {
    --status-note-hue: var(--destructive);

    color: var(--destructive);
  }

  .status-note--warning {
    --status-note-hue: var(--fg-amber);
  }
</style>
