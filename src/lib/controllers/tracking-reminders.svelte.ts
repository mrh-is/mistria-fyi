import { toast } from "svelte-sonner";

import { shouldNudgeInstall, shouldSuggestBackup } from "#lib/engine/tracking-reminders.js";
import * as m from "#lib/paraglide/messages.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { currentDevice } from "#lib/sync/device.js";
import { BACKUP_FILE_PREFIX, downloadJson } from "#lib/utils/download.js";

import type { InstallNudgeMoment } from "#lib/engine/tracking-reminders.js";

let installOpen = $state(false);
let reminderQueue = Promise.resolve();
let backupToast: number | string | undefined;

/** A progress write can wait for another tab; later reminders must still get their turn. */
function queueReminder(check: () => Promise<void>): Promise<void> {
  const previous = reminderQueue;
  const next = (async () => {
    try {
      await previous;
    } catch {
      // A failed check must not prevent later visits or milestones from checking again.
    }
    await check();
  })();
  reminderQueue = next;
  return next;
}

/** Storage persistence is best effort; backup guidance never depends on its answer. */
async function requestPersistence(): Promise<void> {
  try {
    const nav = navigator as { storage?: Partial<StorageManager> };
    await nav.storage?.persist?.();
  } catch {
    // Browsers can refuse or omit this API. Progress still uses the normal storage path.
  }
}

export function downloadProgressBackup(): void {
  downloadJson(userState.exportBackup(), BACKUP_FILE_PREFIX);
  void userState.updateReminders((current) => ({ ...current, backupFacts: userState.factCount }));
}

export const trackingReminders = {
  checkBackup(): Promise<void> {
    return queueReminder(async () => {
      if (installOpen || userState.syncBlocked || userState.trackingLaneNeeded) return;
      if (
        !shouldSuggestBackup({
          factCount: userState.factCount,
          lane: userState.trackingLane,
          reminders: userState.reminders,
        })
      ) {
        return;
      }
      const count = userState.factCount;
      if (await userState.updateReminders((current) => ({ ...current, backupFacts: count }))) {
        backupToast = toast(m.tracking_backup_body(), {
          action: { label: m.backup_export_action(), onClick: downloadProgressBackup },
          duration: 15_000,
        });
      }
    });
  },
  checkInstall(moment: InstallNudgeMoment): Promise<void> {
    return queueReminder(async () => {
      if (installOpen || userState.syncBlocked || userState.trackingLaneNeeded) return;
      const now = Date.now();
      if (
        !shouldNudgeInstall(moment, {
          fingerprint: userState.progressFingerprint,
          hasAnyProgress: userState.hasAnyProgress,
          iosBrowser: currentDevice().iosBrowser,
          lane: userState.trackingLane,
          now,
          reminders: userState.reminders,
        })
      ) {
        return;
      }
      const fingerprint = userState.progressFingerprint;
      const written = await userState.updateReminders((current) => ({
        ...current,
        install: { ...current?.install, fingerprint, shownAt: now },
      }));
      if (written) {
        if (backupToast !== undefined) toast.dismiss(backupToast);
        installOpen = true;
      }
    });
  },
  async chooseHandTracking(): Promise<boolean> {
    const empty = !userState.hasAnyProgress;
    if (!(await userState.startTrackingByHand())) return false;
    if (empty) userState.markDefaultUnlocksComplete();
    void requestPersistence();
    await trackingReminders.checkInstall("lane-chosen");
    return true;
  },
  closeInstall(installed = false): void {
    if (installed) {
      void userState.updateReminders((current) => ({
        ...current,
        install: { ...current?.install, dismissed: true },
      }));
    }
    installOpen = false;
  },
  get installOpen(): boolean {
    return installOpen;
  },
  async opened(): Promise<void> {
    if (userState.trackingLane === undefined || userState.syncBlocked) return;
    void requestPersistence();
    await trackingReminders.checkInstall("open");
    await userState.updateReminders((current) => ({ ...current, lastOpenedAt: Date.now() }));
    await trackingReminders.checkBackup();
  },
};
