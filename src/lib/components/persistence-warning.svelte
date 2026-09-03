<script lang="ts">
  import { toast } from "svelte-sonner";

  import { userState } from "$lib/stores/user-state.svelte.js";

  // Rate-limit: suppress the toast for 60 seconds after dismissal
  const SUPPRESS_MS = 60_000;
  let suppressedUntil = 0;
  let activeToastId: number | string | undefined;

  $effect(() => {
    if (userState.persistenceFailed && Date.now() >= suppressedUntil) {
      if (activeToastId !== undefined) {
        toast.dismiss(activeToastId);
      }

      activeToastId = toast.error(
        "Your changes may not be saved. Check your browser storage settings or export a backup.",
        {
          action: {
            label: "Settings",
            onClick: () => {
              window.location.href = "/settings";
            },
          },
          duration: Infinity,
          onDismiss: () => {
            suppressedUntil = Date.now() + SUPPRESS_MS;
            userState.dismissPersistenceWarning();
            activeToastId = undefined;
          },
        },
      );
    } else if (!userState.persistenceFailed && activeToastId !== undefined) {
      toast.dismiss(activeToastId);
      activeToastId = undefined;
    }
  });
</script>
