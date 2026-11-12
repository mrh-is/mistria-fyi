<script lang="ts">
  import IconHome from "@tabler/icons-svelte-runes/icons/home";

  import { Icon } from "#lib/components/icon/index.js";

  import type { ThumbTab } from "#lib/components/book/thumb-tab-list.js";

  let { class: className, key }: { class?: string; key: ThumbTab["key"] } = $props();
</script>

{#if key === "home"}
  <IconHome class={className} />
{:else}
  <Icon.Category category={key === "everything" ? "all" : key} class={className} />
{/if}
