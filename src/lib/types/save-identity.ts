/** A farm's stable identity. Missing facts stay unknown; names never participate in identity. */
export interface FarmIdentity {
  creationVersion: null | { major: number; minor: number; patch: number; pre: null | string };
  saveNumber: null | string;
}

/** The last manual import, carried with progress in storage and backups. */
export interface SaveImportMetadata {
  farmName: null | string;
  identity: FarmIdentity;
  importedAt: number;
  playerName: null | string;
}
