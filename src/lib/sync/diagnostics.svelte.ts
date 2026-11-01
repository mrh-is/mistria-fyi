/**
 * A tab's bounded, memory-only public diagnostics. Project the useful facts at collection time:
 * never put saves, filenames, names, receipts, question IDs, fact values, or credentials in events.
 * A separate bounded private comparison context rechecks IDs as more names become known.
 */
import { MAX_SYNC_EVENTS, MAX_SYNC_LOG_BYTES } from "#lib/feedback/sync-log-schema.js";

import { createDiagnosticRedaction } from "./diagnostic-redaction.js";
import { FOLLOW_PROTOCOL_VERSION, isFollowKey, mailboxIdFor } from "./follow.js";
import { syncSwitchOn } from "./sync-switch.js";

import type { SyncDifference } from "#lib/engine/sync-apply.js";
import type { SyncLog, SyncLogEvent } from "#lib/feedback/sync-log-schema.js";
import type { SyncApplyOutcome } from "#lib/stores/user-state.svelte.js";

import type { PrivateValues } from "./diagnostic-redaction.js";
import type { ReadSave } from "./read-save.js";

export type { PrivateValues } from "./diagnostic-redaction.js";

interface SyncDiagnostics {
  record: (
    save: ReadSave,
    outcome: SyncApplyOutcome,
    privateValues: PrivateValues,
  ) => Promise<void>;
  snapshot: (appBuild: string, lane: SyncLog["lane"]) => SyncLog | undefined;
  status: (outcome: SyncLogEvent["outcome"]) => void;
}

export function createSyncDiagnostics(): SyncDiagnostics {
  const redaction = createDiagnosticRedaction();
  // Replaced rather than mutated, so an open preview shows each new event.
  let events = $state.raw<{ event: SyncLogEvent; order: number }[]>([]);
  let nextOrder = 0;
  // A random, unexported salt prevents enumerating the game's small farm-number space. It is
  // created lazily so server rendering has no per-player state.
  let salt: string | undefined;

  function redactEvent(event: SyncLogEvent): SyncLogEvent {
    return {
      ...event,
      unknownFields: event.unknownFields.map(({ field, ids }) => ({
        field,
        ids: ids
          .map((id) => redaction.id(id))
          .filter((id, index, all) => all.indexOf(id) === index),
      })),
    };
  }

  function recheckEvents(): void {
    retain(events.map(({ event, order }) => ({ event: redactEvent(event), order })));
  }

  function add(event: SyncLogEvent, order = nextOrder++): void {
    if (!syncSwitchOn) return;
    // Recheck here too: another record can reveal a name while this event's hashing is pending.
    retain([...events, { event: redactEvent(event), order }].toSorted((a, b) => a.order - b.order));
  }

  function retain(next: typeof events): void {
    // Reserve metadata space, and measure UTF-8 bytes rather than string length.
    while (
      next.length > MAX_SYNC_EVENTS ||
      new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_SYNC_LOG_BYTES - 1024
    ) {
      next.shift();
    }
    events = next;
  }

  return {
    async record(
      save: ReadSave,
      outcome: SyncApplyOutcome,
      { credentials, farmNames, farmNumbers, playerNames }: PrivateValues,
    ): Promise<void> {
      if (!syncSwitchOn) return;
      const order = nextOrder++;
      try {
        const { saveNumber } = save.metadata.identity;
        redaction.remember({
          credentials,
          farmNames: [...save.names.farm, ...farmNames],
          farmNumbers: [saveNumber, ...farmNumbers],
          playerNames: [...save.names.player, ...playerNames],
        });
        // Update an already-open preview before yielding for any crypto work.
        recheckEvents();
        const mailboxes = await Promise.all(
          credentials
            .filter((value): value is string => typeof value === "string")
            .filter((value) => isFollowKey(value))
            .map((key) => mailboxIdFor(key)),
        );
        redaction.remember({ credentials: mailboxes });
        recheckEvents();
        const unknownFields: SyncLogEvent["unknownFields"] = [];
        let remainingIds = 100;
        const fields = { ...save.extraction.fields, ...save.extraction.identity };
        for (const [field, extracted] of Object.entries(fields)) {
          if (extracted.completeness !== "unknown") continue;
          const ids = extracted.diagnostics
            .flatMap((diagnostic) =>
              diagnostic.code === "unknown-id" ? [redaction.id(diagnostic.id)] : [],
            )
            .filter((id, index, all) => all.indexOf(id) === index)
            .slice(0, Math.min(20, remainingIds));
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
        policies: [],
        unknownFields: [],
      });
    },
  };
}

export const syncDiagnostics = createSyncDiagnostics();
