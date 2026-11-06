import { describe, expect, it } from "vitest";

import {
  INSTALL_NUDGE_COOLDOWN_MS,
  progressFingerprint,
  shouldNudgeInstall,
  shouldSuggestBackup,
} from "./tracking-reminders.js";

const context = {
  fingerprint: "changed",
  hasAnyProgress: true,
  iosBrowser: true,
  lane: "manual" as const,
  now: INSTALL_NUDGE_COOLDOWN_MS,
  reminders: { install: { fingerprint: "old", shownAt: 0 } },
};

describe("install reminders", () => {
  it("requires an iOS browser, a lane, and no permanent dismissal", () => {
    expect(shouldNudgeInstall("lane-chosen", context)).toBe(true);
    for (const patch of [
      { iosBrowser: false },
      { lane: undefined },
      { reminders: { install: { dismissed: true as const } } },
    ]) {
      expect(shouldNudgeInstall("lane-chosen", { ...context, ...patch })).toBe(false);
    }
  });

  it("shows on choosing by hand even with no progress or a recent reminder", () => {
    expect(shouldNudgeInstall("lane-chosen", { ...context, hasAnyProgress: false, now: 1 })).toBe(
      true,
    );
  });

  it.each(["open", "milestone"] as const)(
    "requires both cooldown and changed progress on %s",
    (moment) => {
      expect(shouldNudgeInstall(moment, context)).toBe(true);
      expect(shouldNudgeInstall(moment, { ...context, lane: "sync" })).toBe(true);
      expect(shouldNudgeInstall(moment, { ...context, now: context.now - 1 })).toBe(false);
      expect(shouldNudgeInstall(moment, { ...context, fingerprint: "old" })).toBe(false);
      expect(shouldNudgeInstall(moment, { ...context, hasAnyProgress: false })).toBe(false);
      expect(shouldNudgeInstall(moment, { ...context, reminders: undefined })).toBe(true);
    },
  );
});

it("suggests a backup for each further hundred facts tracked by hand", () => {
  expect(shouldSuggestBackup({ factCount: 100, lane: "manual", reminders: undefined })).toBe(true);
  expect(
    shouldSuggestBackup({ factCount: 199, lane: "manual", reminders: { backupFacts: 100 } }),
  ).toBe(false);
  expect(
    shouldSuggestBackup({ factCount: 200, lane: "manual", reminders: { backupFacts: 100 } }),
  ).toBe(true);
  expect(shouldSuggestBackup({ factCount: 200, lane: "sync", reminders: undefined })).toBe(false);
  expect(shouldSuggestBackup({ factCount: 200, lane: undefined, reminders: undefined })).toBe(
    false,
  );
});

it("fingerprints facts independently of insertion order and detects changed values", () => {
  const facts = new Map([
    ["a", "1"],
    ["b", "2"],
  ]);
  expect(progressFingerprint(facts)).toBe(
    progressFingerprint(
      new Map([
        ["b", "2"],
        ["a", "1"],
      ]),
    ),
  );
  expect(progressFingerprint(facts)).not.toBe(
    progressFingerprint(
      new Map([
        ["a", "2"],
        ["b", "2"],
      ]),
    ),
  );
});
