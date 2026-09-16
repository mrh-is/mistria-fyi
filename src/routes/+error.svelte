<script lang="ts">
  import { IconHome } from "@tabler/icons-svelte-runes";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { localizeHref } from "$lib/paraglide/runtime.js";
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
  <!-- eslint-disable svelte/no-navigation-without-resolve -- href is resolve()d before localizing -->
  <a
    class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    href={localizeHref(resolve("/"))}
  >
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
    <IconHome class="size-4" />
    Back to home
  </a>
</div>
