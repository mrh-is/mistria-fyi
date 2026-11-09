<script lang="ts">
  import IconLock from "@tabler/icons-svelte-runes/icons/lock";
  import IconWorld from "@tabler/icons-svelte-runes/icons/world";

  import * as m from "#lib/paraglide/messages.js";

  export type Visibility = "private" | "public";

  let { id, visibility }: { id?: string; visibility: Visibility } = $props();
</script>

<!-- Says in words, not only in color, who will see an extra. -->
<span {id} class="visibility-tag visibility-tag--{visibility}">
  {#if visibility === "public"}
    <IconWorld class="size-3 shrink-0" aria-hidden="true" />{m.feedback_visibility_public()}
  {:else}
    <IconLock class="size-3 shrink-0" aria-hidden="true" />{m.feedback_visibility_private()}
  {/if}
</span>

<style>
  .visibility-tag {
    --visibility-tag-ink: var(--color-feedback-public);

    display: inline-flex;
    min-height: 20px;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid color-mix(in srgb, var(--visibility-tag-ink) 45%, transparent);
    border-radius: var(--radius);
    padding: 1px 6px;
    color: color-mix(in srgb, var(--visibility-tag-ink) 82%, var(--color-ink));
    background: color-mix(in srgb, var(--visibility-tag-ink) 9%, transparent);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    letter-spacing: 0.12em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .visibility-tag--private {
    --visibility-tag-ink: var(--color-feedback-private);
  }
</style>
