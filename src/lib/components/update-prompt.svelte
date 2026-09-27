<script lang="ts" module>
  // Module scope survives the remount a locale switch causes, so a dismissed prompt stays dismissed
  // until the next page load.
  let dismissed = false;
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import * as m from "$lib/paraglide/messages.js";
  import { watchForAppUpdate } from "$lib/utils/app-update";

  // A fixed ID makes a repeat announcement (a newer deploy, a remount) replace the toast in place.
  const TOAST_ID = "app-update";

  function dismiss(): void {
    dismissed = true;
  }

  onMount(() =>
    watchForAppUpdate({
      onUpdateReady: (activate) => {
        if (dismissed) return;
        toast(m.app_update_available(), {
          action: { label: m.app_update_refresh(), onClick: activate },
          cancel: { label: m.app_update_later(), onClick: dismiss },
          // The message is longer than an undo toast's, so the buttons get their own row.
          classes: {
            actionButton:
              "shrink-0 text-sm font-medium text-primary bg-primary/10 rounded-md px-2.5 py-1",
            toast: "flex-wrap justify-end [&>[data-content]]:basis-full",
          },
          duration: Infinity,
          id: TOAST_ID,
          onDismiss: dismiss,
        });
      },
    }),
  );
</script>
