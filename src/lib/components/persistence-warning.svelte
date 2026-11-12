<script lang="ts">
  import { toast } from "svelte-sonner";

  import * as m from "#lib/paraglide/messages.js";
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
    if (activeToastId !== undefined) {
      toast.dismiss(activeToastId);
    }

    const dismissed = (): void => {
      suppressedUntil = Date.now() + SUPPRESS_MS;
      userState.dismissPersistenceWarning();
      activeToastId = undefined;
    };
    // The backup exports what's in memory, so it includes the change that didn't save. It skips the
    // backup reminder's bookkeeping, a storage write that would only fail & raise this again.
    activeToastId = toast.error(m.persistence_warning_title(), {
      // Sonner closes the toast on an action without calling onDismiss, so the action counts as one.
      action: {
        label: m.persistence_warning_backup(),
        onClick: () => {
          downloadJson(userState.exportBackup(), BACKUP_FILE_PREFIX);
          dismissed();
        },
      },
      description: m.persistence_warning(),
      duration: Infinity,
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
