<script lang="ts">
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import * as m from "#lib/ui-messages/messages.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  // The note shown where a tracker section has nothing to list. Without a `message`, it blames the
  // filters, and links to the filter panel when the page's toolbar has one.
  let { message }: { message?: string } = $props();
</script>

<p class="py-4 text-center text-sm text-muted-foreground" data-tracker-empty>
  {#if message}
    {message}
  {:else if toolbarState.filterPanelAvailable}
    {#each messageParts( (slot) => m.no_items_match_filters( { filters: slot("filters") } ) ) as part, index (index)}
      {#if typeof part === "string"}{part}{:else}<button
          type="button"
          class="hover:text-ink cursor-pointer underline underline-offset-2"
          onclick={() => {
            toolbarState.requestFilterPanel();
          }}>{m.no_items_match_filters_link()}</button
        >{/if}
    {/each}
  {:else}
    {m.no_items_match_filters({ filters: m.no_items_match_filters_link() })}
  {/if}
</p>
