import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as v from "valibot";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { extractSave, unpackSavFile } from "#lib/engine/import-save.js";
import { isSaveSection } from "#lib/engine/save-bundle.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import { MAX_PROGRESS_ATTACHMENT_BYTES, progressAttachment } from "./progress-attachment.js";
import { SyncLogSchema } from "./sync-log-schema.js";

import type { SyncAnswer } from "#lib/engine/sync-apply.js";
import type * as GitHubAuth from "#lib/server/github-app-auth.js";
import type { SyncApplyOutcome } from "#lib/stores/user-state.svelte.js";
import type { ReadSave } from "#lib/sync/read-save.js";

vi.mock("#lib/sync/sync-switch.js", () => ({ syncSwitchOn: true }));
vi.mock("#lib/server/deployment.js", () => ({ isProductionDeployment: true }));
vi.mock("#lib/server/github-app-auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof GitHubAuth>()),
  installationTokens: { getToken: () => Promise.resolve("test-token") },
}));

// Local-only evidence: CI has no saves. Names & contents stay in pipeline/input and never in output.
const directory = path.resolve("pipeline/input", `v${trackerData.version}`, "save");
const files = existsSync(directory)
  ? readdirSync(directory).filter((name) => name.endsWith(".sav"))
  : [];

const knownIds = new Set<string>();
function collectKeys(value: unknown): void {
  if (!isSaveSection(value)) return;
  for (const [key, child] of Object.entries(value)) {
    knownIds.add(key);
    if (Array.isArray(child)) {
      for (const entry of child) collectKeys(entry);
    } else {
      collectKeys(child);
    }
  }
}
beforeAll(() => {
  collectKeys(trackerData);
});

/** Inspect strings & keys, exempting only complete tracker-known IDs, never arbitrary substrings. */
function leakedLabels(value: unknown, privateValues: Record<string, unknown>): string[] {
  const leaves: string[] = [];
  function visit(child: unknown): void {
    if (Array.isArray(child)) {
      for (const entry of child) visit(entry);
    } else if (isSaveSection(child)) {
      for (const [key, entry] of Object.entries(child)) {
        leaves.push(key);
        visit(entry);
      }
    } else if (typeof child === "string" || typeof child === "number") {
      leaves.push(String(child));
    }
  }
  visit(value);
  return Object.entries(privateValues).flatMap(([label, secret]) => {
    if ((typeof secret !== "string" && typeof secret !== "number") || String(secret).length === 0) {
      return [];
    }
    const text = String(secret);
    const escaped = text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const token = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu");
    return leaves.some((leaf) => {
      if (
        knownIds.has(leaf) ||
        (leaf.includes("/") && knownIds.has(leaf.slice(leaf.indexOf("/") + 1)))
      ) {
        return false;
      }
      return typeof secret === "number" ? leaf === text : token.test(leaf);
    })
      ? [label]
      : [];
  });
}

afterEach(() => vi.unstubAllGlobals());

describe.skipIf(files.length === 0)("real saves in public feedback (local assets only)", () => {
  it.each(files.map((name, index) => ({ index: index + 1, name })))(
    "applies local save $index & submits bounded private-free attachments",
    async ({ name }) => {
      vi.resetModules();
      vi.stubGlobal("localStorage", memoryStorage());
      vi.stubGlobal("__sveltekit_cloudflare_platform", {
        env: {
          GITHUB_APP_ID: "test-app",
          GITHUB_APP_INSTALLATION_ID: "test-installation",
          GITHUB_APP_PRIVATE_KEY: "test-key",
          TURNSTILE_SECRET_KEY: "test-secret",
        },
      });
      const [
        { userState },
        { createSyncDiagnostics },
        { readSaveFile, stampOf },
        { POST: handlePost },
      ] = await Promise.all([
        import("#lib/stores/user-state.svelte.js"),
        import("#lib/sync/diagnostics.svelte.js"),
        import("#lib/sync/read-save.js"),
        import("../../routes/api/feedback/+server.js"),
      ]);
      const fullPath = path.join(directory, name);
      const file = new File([readFileSync(fullPath)], name, {
        lastModified: statSync(fullPath).mtimeMs,
      });
      const saved = await readSaveFile(file);
      const bundle = await unpackSavFile(file);
      userState.loadFromStorage();
      async function apply(
        save: ReadSave,
        answers: Record<string, SyncAnswer> = {},
        attempt = 0,
      ): Promise<SyncApplyOutcome> {
        const outcome = await userState.applySyncedSave({
          ...stampOf(save),
          answers,
          extraction: save.extraction,
          metadata: save.metadata,
          wantsLane: () => true,
        });
        if (outcome.kind !== "ask") return outcome;
        if (attempt >= 5) throw new Error("Save questions did not settle");
        for (const question of outcome.questions) {
          answers[question.id] = question.kind === "farm" ? "new-farm" : "accept";
        }
        return apply(save, answers, attempt + 1);
      }
      const outcome = await apply(saved);
      expect(outcome.kind).toBe("applied");
      expect(
        saved.extraction.diagnostics
          .filter((entry) => entry.code === "unknown-id")
          .map(() => "unknown-id"),
      ).toEqual([]);
      const log = createSyncDiagnostics();
      await log.record(saved, outcome, {
        credentials: [],
        farmNames: [],
        farmNumbers: [],
        playerNames: [],
      });
      const syncLog = log.snapshot("build", "manual");
      expect(v.safeParse(SyncLogSchema, syncLog).success).toBe(true);
      const raw = JSON.parse(userState.exportBackup()) as { progress: Record<string, unknown> };
      const attachment = progressAttachment(raw.progress);
      const pet = isSaveSection(bundle.gamedata?.pet) ? bundle.gamedata.pet : {};
      const mount = isSaveSection(bundle.player?.mount) ? bundle.player.mount : {};
      const facts = isSaveSection(bundle.gamedata?.t2_world_facts)
        ? bundle.gamedata.t2_world_facts
        : {};
      const daycare = Array.isArray(bundle.gamedata?.daycare) ? bundle.gamedata.daycare : [];
      const privateValues = {
        farmName: bundle.player?.farm_name,
        farmNumber: saved.metadata.identity.saveNumber,
        fileName: saved.fileName,
        hash: saved.hash,
        headerFarm: bundle.header?.farm_name,
        headerName: bundle.header?.name,
        lastPlayed: bundle.info?.last_played,
        modified: saved.modified,
        mountName: mount.name,
        petName: pet.name,
        playerName: bundle.player?.name,
        playtime: saved.playtime,
        worldName: facts.ari_name,
        ...Object.fromEntries(
          daycare.map((animal, i) => [
            `animalName${String(i)}`,
            isSaveSection(animal) ? animal.name : undefined,
          ]),
        ),
      };
      expect(leakedLabels(syncLog, privateValues)).toEqual([]);
      expect(leakedLabels(attachment, privateValues)).toEqual([]);
      expect(new TextEncoder().encode(JSON.stringify(attachment)).byteLength).toBeLessThanOrEqual(
        MAX_PROGRESS_ATTACHMENT_BYTES,
      );
      expect(progressAttachment(attachment)).toEqual(attachment);
      expect(
        isSaveSection(attachment.provenance) && attachment.provenance.summarized === true,
      ).toBe(new TextEncoder().encode(JSON.stringify(raw.progress)).byteLength > 50 * 1024);
      const fetchMock = vi.fn((url: string, _options?: RequestInit) => {
        if (url.includes("turnstile")) return Promise.resolve(Response.json({ success: true }));
        return Promise.resolve(
          Response.json({ html_url: "https://example.com/feedback/1", number: 1 }, { status: 201 }),
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      const url = new URL("https://mistria.fyi/api/feedback");
      const request = new Request(url.toString(), {
        body: JSON.stringify({
          appVersion: "build",
          gameDataVersion: trackerData.version,
          message: "m".repeat(5000),
          saveData: attachment,
          syncLog,
          turnstileToken: "test-token",
        }),
        headers: { "Content-Type": "application/json", Origin: url.origin },
        method: "POST",
      });
      // Happy DOM’s browser Request strips Origin; reconstruct the header the server receives.
      Object.defineProperty(request, "headers", {
        value: new Headers({
          "Content-Type": "application/json",
          Origin: url.origin,
        }),
      });
      const response = await handlePost({ request, url } as Parameters<typeof handlePost>[0]);
      expect(response.status).toBe(200);
      const call = fetchMock.mock.calls.find(([target]) => target.endsWith("/issues"));
      if (!call?.[1]) throw new Error("Feedback did not reach mocked GitHub");
      const body = (JSON.parse(call[1].body as string) as { body: string }).body;
      expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(65_536);
      const jsonBlocks = [...body.matchAll(/```json\n([\s\S]*?)\n```/gu)].map(
        (match) => JSON.parse(match[1]) as unknown,
      );
      expect(leakedLabels(jsonBlocks, privateValues)).toEqual([]);
      const mutated = structuredClone(bundle);
      mutated.player = {
        ...mutated.player,
        items_acquired: [
          ...(Array.isArray(mutated.player?.items_acquired)
            ? (mutated.player.items_acquired as unknown[]).filter(
                (id): id is string => typeof id === "string",
              )
            : []),
          "unknown_feedback_probe",
        ],
      };
      const changed = {
        ...saved,
        extraction: extractSave(mutated),
        hash: "synthetic-changed-file",
      };
      const changedOutcome = await apply(changed);
      expect(changedOutcome.kind).toBe("applied");
      const after = JSON.parse(userState.exportBackup()) as { progress: Record<string, unknown> };
      expect(JSON.stringify(progressAttachment(after.progress))).not.toContain(
        "unknown_feedback_probe",
      );
    },
  );
});
