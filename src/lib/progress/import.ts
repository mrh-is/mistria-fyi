import type { ProgressRepository } from "#lib/stores/progress-repository.js";
import type { SaveImportMetadata } from "#lib/types/save-identity.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

interface ImportShell {
  readonly lastImport: DeepReadonly<null | SaveImportMetadata>;
}

interface ImportFacade {
  /** The farm & player from the last save import, or null before the first one. */
  readonly lastImport: DeepReadonly<null | SaveImportMetadata>;
  /**
   * Applies a native save additively. The farm decision, lane guard, & write all use the latest
   * stored value, so another tab cannot start sync or change farms behind the import.
   */
  mergeFromSave: ProgressRepository["merge"];
}

/** Manual saves merge through the repository’s locked, additive write path. */
export function createImportFacade(
  repository: Pick<ProgressRepository, "merge">,
  shell: ImportShell,
): ImportFacade {
  return {
    get lastImport(): DeepReadonly<null | SaveImportMetadata> {
      return shell.lastImport;
    },
    mergeFromSave: repository.merge,
  };
}
