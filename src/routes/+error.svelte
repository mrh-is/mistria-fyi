<script lang="ts">
  import IconHome from "@tabler/icons-svelte-runes/icons/home";

  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  const feedbackContext = getFeedbackContext();
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
  <span class="text-6xl font-bold text-muted-foreground/50">{page.status}</span>
  <p class="text-lg text-muted-foreground">
    {#if page.status === 404}
      {m.error_not_found()}
    {:else}
      {m.error_generic()}
    {/if}
  </p>
  <a
    class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    href={localizedHref("")}
  >
    <IconHome class="size-4" />
    {m.error_back_home()}
  </a>
  {#if page.status !== 404}
    <button
      class="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
      type="button"
      onclick={() => feedbackContext.reportError(m.error_generic())}
    >
      {m.error_report_action()}
    </button>
  {/if}
</div>
