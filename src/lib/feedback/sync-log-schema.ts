import * as v from "valibot";

/** Deliberately closed: neither save paths nor arbitrary object keys belong in public feedback. */
const FieldSchema = v.picklist([
  "almanac",
  "almanacRecipes",
  "animalCosmetics",
  "animals",
  "breakUpsDisabled",
  "childChoice",
  "cosmetics",
  "hasUpperFloor",
  "heartLevels",
  "mineFloor",
  "mountAppearances",
  "museum",
  "petCosmetics",
  "petSkins",
  "questStates",
  "reachedSeason",
  "renown",
  "skillLevels",
  "spells",
  "unlockedPerks",
  "villagerRelationships",
  "creationVersion",
  "playtime",
]);
const PolicySchema = v.picklist([
  "apply-and-tell",
  "apply-silently",
  "ask-first",
  "keep-local-and-tell",
]);
const OutcomeSchema = v.picklist([
  "applied",
  "ask",
  "skipped",
  "stale",
  "blocked",
  "switch-failed",
  "write-failed",
  "idle",
  "asking",
  "paused",
  "retired",
  "unreachable",
  "unreadable",
  "up-to-date",
  "update-computer",
  "update-here",
  "waiting",
]);

export const MAX_SYNC_EVENTS = 20;
/** Leaves room for the message & an independently attached progress snapshot. */
export const MAX_SYNC_LOG_BYTES = 24 * 1024;
const CountSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

/** Also checked at the server boundary; extra keys are rejected rather than echoed into GitHub. */
export const SyncLogSchema = v.pipe(
  v.strictObject({
    appBuild: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
    events: v.pipe(
      v.array(
        v.strictObject({
          farmHash: v.nullable(v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u))),
          gameVersion: v.nullable(v.pipe(v.string(), v.regex(/^\d+\.\d+\.\d+$/u), v.maxLength(50))),
          outcome: OutcomeSchema,
          policies: v.pipe(
            v.array(
              v.strictObject({
                count: CountSchema,
                field: FieldSchema,
                policy: PolicySchema,
              }),
            ),
            v.maxLength(84),
          ),
          unknownFields: v.pipe(
            v.array(
              v.strictObject({
                field: FieldSchema,
                ids: v.pipe(
                  v.array(v.pipe(v.string(), v.regex(/^[\w.:[\]-]{1,100}$/u))),
                  v.maxLength(20),
                ),
              }),
            ),
            v.maxLength(23),
          ),
        }),
      ),
      v.maxLength(MAX_SYNC_EVENTS),
    ),
    lane: v.picklist(["manual", "computer", "following"]),
    protocolVersion: CountSchema,
  }),
  v.check((log) => new TextEncoder().encode(JSON.stringify(log)).byteLength <= MAX_SYNC_LOG_BYTES),
);

export type SyncLog = v.InferOutput<typeof SyncLogSchema>;
export type SyncLogEvent = SyncLog["events"][number];
