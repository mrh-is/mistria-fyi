import type { TrackingLane, TrackingReminders } from "#lib/sync/lane-state.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

/**
 * When the data-loss reminders show (`docs/app-architecture.md` § Tracking lanes). Safari can clear
 * a site's data after seven days of use without a visit, and the page can't see that clock, so the
 * home-screen nudge keeps its own: it returns once this long has passed since it last showed, and
 * only if progress changed meanwhile.
 */
export const INSTALL_NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/** How many more facts tracked by hand earn another backup suggestion. */
export const BACKUP_SUGGESTION_INTERVAL = 100;

/**
 * What prompts the home-screen nudge: choosing to track by hand, opening the app, or finishing a
 * section or category.
 */
export type InstallNudgeMoment = "lane-chosen" | "milestone" | "open";

export interface InstallNudgeContext {
  /** A {@link progressFingerprint} of progress now. */
  fingerprint: string;
  hasAnyProgress: boolean;
  /** An iPhone or iPad browser, not the home screen app, which keeps its own storage. */
  iosBrowser: boolean;
  lane: TrackingLane | undefined;
  now: number;
  reminders: DeepReadonly<TrackingReminders> | undefined;
}

/**
 * Whether the home-screen nudge shows at `moment`. It never shows outside an iOS browser, before a
 * lane is chosen, or once the player says they've installed the app. Choosing to track by hand
 * always shows it. Otherwise it shows the first time there's progress to lose, then again only
 * after the cooldown & a change to progress since it last showed.
 */
export function shouldNudgeInstall(
  moment: InstallNudgeMoment,
  context: InstallNudgeContext,
): boolean {
  const { iosBrowser, lane, reminders } = context;
  if (!iosBrowser || lane === undefined) return false;
  const install = reminders?.install;
  if (install?.dismissed) return false;
  if (moment === "lane-chosen") return true;
  if (!context.hasAnyProgress) return false;
  if (install?.shownAt === undefined) return true;
  const elapsed = context.now - install.shownAt;
  // A clock set back past the last showing can't prove the cooldown is still running.
  const cooled = elapsed < 0 || elapsed >= INSTALL_NUDGE_COOLDOWN_MS;
  return cooled && install.fingerprint !== context.fingerprint;
}

export interface BackupSuggestionContext {
  /** How many facts progress holds now. */
  factCount: number;
  lane: TrackingLane | undefined;
  reminders: DeepReadonly<TrackingReminders> | undefined;
}

/**
 * Whether to suggest downloading a backup: only on the manual lane, where nothing else holds the
 * progress, once it holds {@link BACKUP_SUGGESTION_INTERVAL} more facts than at the last suggestion
 * or download. A device that never had one counts from zero.
 */
export function shouldSuggestBackup({
  factCount,
  lane,
  reminders,
}: BackupSuggestionContext): boolean {
  if (lane !== "manual") return false;
  return factCount - (reminders?.backupFacts ?? 0) >= BACKUP_SUGGESTION_INTERVAL;
}

/**
 * A short, stable digest of progress facts (`progressFacts`), so a reminder can tell whether
 * progress changed since it showed without storing a copy. FNV-1a over the sorted facts.
 */
export function progressFingerprint(facts: ReadonlyMap<string, string>): string {
  let hash = 0x81_1c_9d_c5;
  for (const key of [...facts.keys()].toSorted()) {
    for (const char of `${key}=${facts.get(key)};`) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
    }
  }
  return `${facts.size.toString(36)}-${hash.toString(36)}`;
}
