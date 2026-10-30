import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { extractSave } from "#lib/engine/import-save.js";
import { progressFacts } from "#lib/engine/provenance.js";
import { applySync } from "#lib/engine/sync-apply.js";
import { readProgressBlob, serializeProgress } from "#lib/stores/progress-storage.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";
import { recordEntries } from "#lib/utils/record.js";

import type { SyncAnswers, SyncState } from "#lib/engine/sync-apply.js";
import type { LoadedProgress, StoredDocument } from "#lib/stores/progress-storage.js";

const FIXTURES = import.meta.glob<StoredDocument>("./progress-storage-fixtures/v*.json", {
  eager: true,
  import: "default",
});
const FARM = { creationVersion: null, saveNumber: "123" };

function read(json: string): LoadedProgress {
  const result = readProgressBlob(json, "strict");
  if (result.kind !== "ok") throw new Error(`Unreadable compatibility fixture: ${result.kind}`);
  return result.loaded;
}

describe.each(recordEntries(FIXTURES))("household sync compatibility: %s", (_name, fixture) => {
  it("round-trips applied facts and kept resolutions without changing the storage format", () => {
    const loaded = read(JSON.stringify(fixture));
    const state: SyncState = { farm: FARM, history: loaded.history, progress: loaded.progress };
    const incoming = {
      extraction: extractSave({
        gamedata: {
          t2_world_facts: {
            ...Object.fromEntries(
              recordEntries(trackerData.villagers)
                .filter(([, v]) => v.dateable)
                .map(([id]) => [`${id}_status`, null]),
            ),
            adeline_status: "spouse",
          },
        },
        player: {
          children: [],
          disable_break_ups: true,
          pending_child: { due_date: 1000, utero: "ari" },
        },
      }),
      farm: FARM,
    };
    const answers: Record<string, "accept"> = {};
    const first = applySync(state, incoming, { fresh: state });
    if (first.kind === "ask") for (const q of first.questions) answers[q.id] = "accept";
    const accepted = applySync(state, incoming, { answers, fresh: state });
    expect(accepted.kind).toBe("applied");
    if (accepted.kind !== "applied") throw new Error("Household questions did not settle");
    const json = serializeProgress({ ...loaded, ...accepted.result.state });
    expect((JSON.parse(json) as { version: number }).version).toBe(CURRENT_SERIALIZATION_VERSION);
    const restored = read(json);
    expect(progressFacts(restored.progress)).toEqual(progressFacts(accepted.result.state.progress));
    expect(restored.progress.childChoice).toBe("yes");
    expect(restored.progress.breakUpsDisabled).toBe(true);
    expect(restored.history).toEqual(accepted.result.state.history);
    expect(restored.retained).toEqual(loaded.retained);

    // An unordered manual edit asks; keeping it survives strict backup restore & a fresh apply.
    restored.history.provenance.breakUpsDisabled = { source: "manual" };
    const edited: SyncState = {
      farm: FARM,
      history: restored.history,
      progress: restored.progress,
    };
    incoming.extraction.fields.breakUpsDisabled.value = false;
    const question = applySync(edited, incoming, { fresh: state });
    expect(question.kind).toBe("ask");
    if (question.kind !== "ask") throw new Error("Expected a manual household disagreement");
    const keep: SyncAnswers = Object.fromEntries(question.questions.map(({ id }) => [id, "keep"]));
    const kept = applySync(edited, incoming, { answers: keep, fresh: state });
    if (kept.kind !== "applied") throw new Error("Keep did not settle");
    const reloaded = read(serializeProgress({ ...restored, ...kept.result.state }));
    const repeated = applySync(
      { farm: FARM, history: reloaded.history, progress: reloaded.progress },
      incoming,
      { fresh: state },
    );
    expect(repeated.kind).toBe("applied");
    expect(reloaded.progress.breakUpsDisabled).toBe(true);
    expect(reloaded.history.resolutions.breakUpsDisabled).toEqual({ saveValue: null });
  });
});
