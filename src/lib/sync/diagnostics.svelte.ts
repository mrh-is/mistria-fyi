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

/** What the device knows beyond the save itself, redacted from any ID that contains it. */
export interface PrivateValues {
  credentials: (null | string | undefined)[];
  farmNames: (null | string | undefined)[];
  playerNames: (null | string | undefined)[];
}

interface SyncDiagnostics {
  record: (
    save: ReadSave,
    outcome: SyncApplyOutcome,
    privateValues: PrivateValues,
  ) => Promise<void>;
  snapshot: (appBuild: string, lane: SyncLog["lane"]) => SyncLog | undefined;
  status: (outcome: SyncLogEvent["outcome"]) => void;
}

/** Below this length a name only matches a whole word, so “Al” leaves `almanac` readable. */
const MIN_SUBSTRING_NAME = 3;

/** Latin letters that Unicode doesn't decompose into a base letter & an accent. */
const ROMANIZED: Readonly<Record<string, string>> = {
  æ: "ae",
  đ: "d",
  ð: "d",
  ı: "i",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

/**
 * Lowercase words without accents, so `Zoë`, `Søren`, & `Mary Jane` meet `zoe_note`, `soren_x`, &
 * `mary-jane`. Words also end at a capital or a digit, so `Bo` meets `BoNote` & `bo2`.
 */
function nameWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .replaceAll(/(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/gu, " ")
    .toLowerCase()
    .replaceAll(/[æðđıłøœßþ]/gu, (letter) => ROMANIZED[letter])
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function isString(value: null | string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function createSyncDiagnostics(): SyncDiagnostics {
  // Replaced rather than mutated, so an open preview shows each new event.
  let events = $state.raw<{ event: SyncLogEvent; order: number }[]>([]);
  let nextOrder = 0;
  // A random, unexported salt prevents enumerating the game's small farm-number space. It is
  // created lazily so server rendering has no per-player state.
  let salt: string | undefined;

  function add(event: SyncLogEvent, order = nextOrder++): void {
    if (!syncSwitchOn) return;
    const next = [...events, { event, order }].toSorted((a, b) => a.order - b.order);
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
      { credentials, farmNames, playerNames }: PrivateValues,
    ): Promise<void> {
      if (!syncSwitchOn) return;
      const order = nextOrder++;
      try {
        const { saveNumber } = save.metadata.identity;
        const secrets = credentials.filter((value) => isString(value));
        const mailboxes = await Promise.all(
          secrets.filter((value) => isFollowKey(value)).map((key) => mailboxIdFor(key)),
        );
        const exact = [saveNumber, ...secrets, ...mailboxes]
          .filter((value) => isString(value))
          .map((value) => value.toLowerCase());
        // A character's whole name & each word of it, since the player may have used a real name.
        // A farm's name counts only whole: its words are ordinary ones like “rose” or “farm”.
        const names = [
          ...[...save.names.player, ...playerNames].flatMap((value) =>
            isString(value) ? [nameWords(value).join(""), ...nameWords(value)] : [],
          ),
          ...[...save.names.farm, ...farmNames]
            .filter((value) => isString(value))
            .map((value) => nameWords(value).join("")),
        ].filter(Boolean);
        const containsName = (id: string): boolean => {
          const words = nameWords(id);
          const joined = words.join("");
          return names.some((name) =>
            name.length < MIN_SUBSTRING_NAME ? words.includes(name) : joined.includes(name),
          );
        };
        const publicId = (id: string): string =>
          /^[\w.:[\]-]{1,100}$/u.test(id) &&
          !exact.some((value) => id.toLowerCase().includes(value)) &&
          !containsName(id)
            ? id
            : "[redacted]";
        const unknownFields: SyncLogEvent["unknownFields"] = [];
        let remainingIds = 100;
        const fields = { ...save.extraction.fields, ...save.extraction.identity };
        for (const [field, extracted] of Object.entries(fields)) {
          if (extracted.completeness !== "unknown") continue;
          const ids = extracted.diagnostics
            .flatMap((diagnostic) =>
              diagnostic.code === "unknown-id" ? [publicId(diagnostic.id)] : [],
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
