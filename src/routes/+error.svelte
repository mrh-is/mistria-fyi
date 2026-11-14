<script lang="ts">
  import IconHome from "@tabler/icons-svelte-runes/icons/home";

  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  let { catalogLoadFailed = false }: { catalogLoadFailed?: boolean } = $props();
  let status = $derived(catalogLoadFailed ? 503 : page.status);
  const feedbackContext = getFeedbackContext();
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
  <span class="text-6xl font-bold text-muted-foreground/50">{status}</span>
  <p class="text-lg text-muted-foreground">
    {#if status === 404}
      This page doesn’t exist. Maybe it wandered off to tend the fields.
    {:else}
      Something went wrong on our end, but your progress is safe.
    {/if}
  </p>
  <a
    class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    href={localizedHref("", { locale: page.data.locale })}
    data-sveltekit-reload={catalogLoadFailed ? "" : undefined}
  >
    <IconHome class="size-4" />
    <!-- @wc-context: error back home -->Back to home
  </a>
  {#if status !== 404 && !catalogLoadFailed}
    <button
      class="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
      type="button"
      onclick={() =>
        feedbackContext.reportError("Something went wrong on our end, but your progress is safe.")}
    >
      Report this error
    </button>
  {/if}
</div>
