import { isSaveSection } from "./save-bundle.js";

import type { FarmIdentity, SaveImportMetadata } from "#lib/types/save-identity.js";

import type { SaveBundle } from "./save-bundle.js";

function part(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function name(value: unknown): null | string {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Optional metadata never prevents progress from importing. Copy only recognized fields. */
export function readSaveIdentity(bundle: SaveBundle): Omit<SaveImportMetadata, "importedAt"> {
  const raw = bundle.info?.creation_version;
  const creationVersion =
    isSaveSection(raw) &&
    part(raw.major) &&
    part(raw.minor) &&
    part(raw.patch) &&
    (raw.pre === undefined || raw.pre === null || typeof raw.pre === "string")
      ? { major: raw.major, minor: raw.minor, patch: raw.patch, pre: raw.pre ?? null }
      : null;
  return {
    farmName: name(bundle.player?.farm_name) ?? name(bundle.header?.farm_name),
    identity: { creationVersion, saveNumber: bundle.saveNumber ?? null },
    playerName: name(bundle.player?.name) ?? name(bundle.header?.name),
  };
}

/**
 * How a save's farm relates to the farm stored progress tracks. The random game number decides;
 * the creation version, when both sides could read it, guards against two games drawing the same
 * number. Progress never identified, or a save whose number is unknown (a renamed file), is
 * `unidentified`: only the player can say whether it's the same farm.
 */
export type FarmMatch = "different" | "same" | "unidentified";

export function compareFarms(tracked: FarmIdentity | null, incoming: FarmIdentity): FarmMatch {
  if (!tracked?.saveNumber || !incoming.saveNumber) return "unidentified";
  if (tracked.saveNumber !== incoming.saveNumber) return "different";
  const [a, b] = [tracked.creationVersion, incoming.creationVersion];
  const differs =
    a !== null &&
    b !== null &&
    (a.major !== b.major || a.minor !== b.minor || a.patch !== b.patch || a.pre !== b.pre);
  return differs ? "different" : "same";
}
