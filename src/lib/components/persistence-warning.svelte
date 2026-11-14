<script lang="ts">
  import { toast } from "svelte-sonner";

  import { userState } from "#lib/stores/user-state.svelte.js";
  import { BACKUP_FILE_PREFIX, downloadJson } from "#lib/utils/download.js";

  // Only a save that failed is a toast. States that block every edit (newer data, storage the
  // browser won't read, unreadable data) hold until fixed, so the book shows them as
  // `book/write-blocked-notice.svelte` at the top of the page instead.
  const SUPPRESS_MS = 60_000;
  let suppressedUntil = 0;
  let activeToastId: number | string | undefined;
  let deferredTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast() {
    const dismissed = (): void => {
      suppressedUntil = Date.now() + SUPPRESS_MS;
      userState.dismissPersistenceWarning();
      activeToastId = undefined;
    };
    // The backup exports what's in memory, so it includes the change that didn't save. It skips the
    // backup reminder's bookkeeping, a storage write that would only fail & raise this again.
    activeToastId = toast.error("We couldn’t save your last change", {
      // Sonner closes the toast on an action without calling onDismiss, so the action counts as one.
      action: {
        label: "Make a backup",
        onClick: () => {
          downloadJson(userState.exportBackup(), BACKUP_FILE_PREFIX);
          dismissed();
        },
      },
      description:
        "Your browser won’t let the field guide store anything. Check your settings to make sure storage isn’t full or turned off. For now, make a backup so you don’t lose your changes.",
      duration: Infinity,
      // Locale changes rerun the effect. Updating the toast keeps its dismissal handler from firing.
      id: activeToastId,
      onDismiss: dismissed,
    });
  }

  $effect(() => {
    const generation = userState.persistenceFailureGeneration;

    if (generation > 0 && userState.persistenceFailureKind === "unavailable") {
      const now = Date.now();
      if (now >= suppressedUntil) {
        clearTimeout(deferredTimer);
        deferredTimer = undefined;
        showToast();
      } else if (deferredTimer === undefined) {
        const delay = suppressedUntil - now;
        deferredTimer = setTimeout(() => {
          deferredTimer = undefined;
          if (userState.persistenceFailed && userState.persistenceFailureKind === "unavailable") {
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
