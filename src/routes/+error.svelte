<script lang="ts">
  import IconHome from "@tabler/icons-svelte-runes/icons/home";

  import { page } from "$app/state";
  import { localizedHref } from "#lib/utils/localized-href.js";
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
  <span class="text-6xl font-bold text-muted-foreground/50">{page.status}</span>
  <p class="text-lg text-muted-foreground">
    {#if page.status === 404}
      This page doesn't exist. Maybe it wandered off to tend the fields.
    {:else}
      Something went wrong.
    {/if}
  </p>
  <a
    class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    href={localizedHref("")}
  >
    <IconHome class="size-4" />
    Back to home
  </a>
</div>
