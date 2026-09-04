<script lang="ts">
  import { toast } from "svelte-sonner";

  import { userState } from "$lib/stores/user-state.svelte.js";

  const SUPPRESS_MS = 60_000;
  let suppressedUntil = 0;
  let activeToastId: number | string | undefined;
  let deferredTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast() {
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
  }

  $effect(() => {
    const generation = userState.persistenceFailureGeneration;

    if (generation > 0) {
      const now = Date.now();
      if (now >= suppressedUntil) {
        clearTimeout(deferredTimer);
        deferredTimer = undefined;
        showToast();
      } else if (deferredTimer === undefined) {
        const delay = suppressedUntil - now;
        deferredTimer = setTimeout(() => {
          deferredTimer = undefined;
          if (userState.persistenceFailed) {
            showToast();
          }
        }, delay);
      }
    } else if (activeToastId !== undefined) {
      toast.dismiss(activeToastId);
      activeToastId = undefined;
      clearTimeout(deferredTimer);
      deferredTimer = undefined;
    }
  });
</script>
