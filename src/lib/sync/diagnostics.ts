/**
 * A tab's bounded, memory-only public diagnostics. Project the useful facts at collection time:
 * never retain saves, filenames, names, receipts, question IDs, fact values, or lane credentials.
 */
import { MAX_SYNC_EVENTS, MAX_SYNC_LOG_BYTES } from "#lib/feedback/sync-log-schema.js";

import { FOLLOW_PROTOCOL_VERSION, isFollowKey, mailboxIdFor } from "./follow.js";
import { syncSwitchOn } from "./sync-switch.js";

import type { SyncDifference } from "#lib/engine/sync-apply.js";
import type { SyncLog, SyncLogEvent } from "#lib/feedback/sync-log-schema.js";
import type { SyncApplyOutcome } from "#lib/stores/user-state.svelte.js";

import type { ReadSave } from "./read-save.js";

interface SyncDiagnostics {
  record: (
    save: ReadSave,
    outcome: SyncApplyOutcome,
    privateValues: (null | string | undefined)[],
  ) => Promise<void>;
  snapshot: (appBuild: string, lane: SyncLog["lane"]) => SyncLog | undefined;
  status: (outcome: SyncLogEvent["outcome"]) => void;
}

export function createSyncDiagnostics(): SyncDiagnostics {
  const events: { event: SyncLogEvent; order: number }[] = [];
  let nextOrder = 0;
  // A random, unexported salt prevents enumerating the game's small farm-number space or linking
  // separate sessions. It is created lazily so server rendering has no per-player state.
  let salt: string | undefined;

  function add(event: SyncLogEvent, order = nextOrder++): void {
    if (!syncSwitchOn) return;
    events.push({ event, order });
    events.sort((a, b) => a.order - b.order);
    // Reserve metadata space, and measure UTF-8 bytes rather than string length.
    while (
      events.length > MAX_SYNC_EVENTS ||
      new TextEncoder().encode(JSON.stringify(events)).byteLength > MAX_SYNC_LOG_BYTES - 1024
    ) {
      events.shift();
    }
  }

  return {
    async record(
      save: ReadSave,
      outcome: SyncApplyOutcome,
      privateValues: (null | string | undefined)[],
    ): Promise<void> {
      if (!syncSwitchOn) return;
      const order = nextOrder++;
      try {
        const { saveNumber } = save.metadata.identity;
        const privateStrings = privateValues.filter(
          (value): value is string => typeof value === "string",
        );
        const mailboxes = await Promise.all(
          privateStrings.filter((value) => isFollowKey(value)).map((key) => mailboxIdFor(key)),
        );
        const sensitive = [
          save.metadata.playerName,
          save.metadata.farmName,
          saveNumber,
          ...privateValues,
          ...mailboxes,
        ]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .map((value) => value.toLowerCase());
        const publicId = (id: string): string =>
          /^[\w.:[\]-]{1,100}$/u.test(id) &&
          !sensitive.some((value) => id.toLowerCase().includes(value))
            ? id
            : "[redacted]";
        const unknownFields: SyncLogEvent["unknownFields"] = [];
        let remainingIds = 100;
        const fields = { ...save.extraction.fields, ...save.extraction.identity };
        for (const [field, extracted] of Object.entries(fields)) {
          if (extracted.completeness !== "unknown") continue;
          const ids = [
            ...new Set(
              extracted.diagnostics.flatMap((diagnostic) =>
                diagnostic.code === "unknown-id" ? [publicId(diagnostic.id)] : [],
              ),
            ),
          ].slice(0, Math.min(20, remainingIds));
          remainingIds -= ids.length;
          unknownFields.push({
            field: field as SyncLogEvent["unknownFields"][number]["field"],
            ids,
          });
        }
        let differences: SyncDifference[] = [];
        if (outcome.kind === "applied") {
          differences = outcome.result.differences;
        } else if (outcome.kind === "ask") {
          differences = outcome.questions.flatMap((question) =>
            question.kind === "facts" ? question.differences : [],
          );
        }
        const policies: SyncLogEvent["policies"] = [];
        for (const { field, policy } of differences) {
          const existing = policies.find(
            (entry) => entry.field === field && entry.policy === policy,
          );
          if (existing) existing.count++;
          else policies.push({ count: 1, field, policy });
        }
        let farmHash: null | string = null;
        if (saveNumber !== null) {
          salt ??= crypto.randomUUID();
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(`${salt}:${saveNumber}`),
          );
          farmHash = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
        }
        add(
          {
            farmHash,
            gameVersion: save.gameVersion,
            outcome: outcome.kind,
            playtime: save.playtime ?? null,
            policies,
            unknownFields,
          },
          order,
        );
      } catch {
        // Diagnostics must never prevent applying a save or reporting feedback.
      }
    },
    snapshot(appBuild: string, lane: SyncLog["lane"]): SyncLog | undefined {
      if (!syncSwitchOn) return undefined;
      return {
        appBuild,
        events: structuredClone(events.map(({ event }) => event)),
        lane,
        protocolVersion: FOLLOW_PROTOCOL_VERSION,
      };
    },
    status(outcome: SyncLogEvent["outcome"]): void {
      add({
        farmHash: null,
        gameVersion: null,
        outcome,
        playtime: null,
        policies: [],
        unknownFields: [],
      });
    },
  };
}

export const syncDiagnostics = createSyncDiagnostics();
