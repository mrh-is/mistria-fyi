import type { VillagerId } from "#lib/types/tracker-data.js";

export type GameObservation<T> =
  | { source: null; status: "pending"; value: null }
  | {
      source: {
        evidence: string;
        observedOn: string;
        observer: string;
      };
      status: "confirmed";
      value: T;
    };

interface SaveObservations {
  file: string;
  gameVersion: string;
  mineFloor: GameObservation<number>;
  museum: GameObservation<{ donated: string[]; notDonated: string[] }>;
  sha256: string;
  spouse: GameObservation<null | VillagerId>;
}

// These records describe exact private snapshots, independently of trackerData.version.
// Only a player’s game observations can fill in values; importer output is never evidence.
// See docs/save-import-verification.md for the checklist & permission boundaries.
export const SAVE_OBSERVATIONS: SaveObservations[] = [
  {
    file: "game-1315159680-autosave.sav",
    gameVersion: "1.0.8",
    mineFloor: { source: null, status: "pending", value: null },
    museum: { source: null, status: "pending", value: null },
    sha256: "6f4badda3f7134419648b6c6b1bc0bddabb84802af103ab368886de687a8c77d",
    spouse: {
      source: {
        evidence:
          "The owner reported being married to Ryis in their actively played farm, before the importer comparison. They then replaced this private v1.0.8 autosave on this machine & identified it as that farm’s current save. This is a player report; no screenshot was supplied.",
        observedOn: "2026-11-01",
        observer: "Repository owner (mrh-is)",
      },
      status: "confirmed",
      value: "ryis" as VillagerId,
    },
  },
  {
    file: "game-1720221376-autosave.sav",
    gameVersion: "1.0.8",
    mineFloor: { source: null, status: "pending", value: null },
    museum: { source: null, status: "pending", value: null },
    sha256: "153e006525a5676b3e779446adb41732295c06e4b453f765590a55a9b5c1621d",
    spouse: { source: null, status: "pending", value: null },
  },
];
