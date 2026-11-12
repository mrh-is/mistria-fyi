<script lang="ts">
  import { toast } from "svelte-sonner";

  import { userState } from "#lib/stores/user-state.svelte.js";
  import { BACKUP_FILE_PREFIX, downloadJson } from "#lib/utils/download.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { goto } from "$app/navigation";

  import type { PersistenceFailureKind } from "#lib/stores/user-state.svelte.js";

  interface Warning {
    action?: { label: string; onClick: () => void };
    description?: string;
    title: string;
  }

  const openData = { label: "Data management", onClick: () => void goto(localizedHref("data")) };

  const WARNINGS: Record<PersistenceFailureKind, () => Warning> = {
    // Nothing loaded, so there's nothing to back up yet; a reload after fixing settings is the fix.
    "load-blocked": () => ({
      description:
        "Your browser won’t let the field guide read its storage, so your progress isn’t showing. Nothing has been erased. Check your settings to make sure storage isn’t turned off, then reload the page.",
      title: "We can’t reach your saved progress",
    }),
    // Newer data can't be recovered from Data management; only updating the app helps.
    "newer-data": () => ({
      title:
        "Your progress is safe! A newer version of the field guide saved it, so reload this page to get the latest update.",
    }),
    // The backup exports what's in memory, so it includes the change that didn't save. It skips
    // the backup reminder's bookkeeping, a storage write that would only fail & raise this again.
    unavailable: () => ({
      action: {
        label: "Make a backup",
        onClick: () => {
          downloadJson(userState.exportBackup(), BACKUP_FILE_PREFIX);
        },
      },
      description:
        "Your browser won’t let the field guide store anything. Check your settings to make sure storage isn’t full or turned off. For now, make a backup so you don’t lose your changes.",
      title: "We couldn’t save your last change",
    }),
    unreadable: () => ({
      action: openData,
      title:
        "We can’t read your saved progress, so we’re not saving changes for now. This isn’t anything you did. Download a copy of the unreadable data from Data so nothing gets lost.",
    }),
  };
  const SUPPRESS_MS = 60_000;
  let suppressedUntil = 0;
  let activeToastId: number | string | undefined;
  let deferredTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast() {
    if (activeToastId !== undefined) {
      toast.dismiss(activeToastId);
    }

    const warning = WARNINGS[userState.persistenceFailureKind]();
    const dismissed = (): void => {
      suppressedUntil = Date.now() + SUPPRESS_MS;
      userState.dismissPersistenceWarning();
      activeToastId = undefined;
    };
    activeToastId = toast.error(warning.title, {
      // Sonner closes the toast on an action without calling onDismiss, so the action counts as one.
      action: warning.action && {
        label: warning.action.label,
        onClick: () => {
          warning.action?.onClick();
          dismissed();
        },
      },
      description: warning.description,
      duration: Infinity,
      onDismiss: dismissed,
    });
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
