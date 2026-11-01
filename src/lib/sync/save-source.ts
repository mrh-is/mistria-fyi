/**
 * Where the gaming computer's save comes from: a file handle the courier can watch, or a one-time
 * file (`docs/sync.md` § What the probe found). A handle only comes out of a drop or a paste, & only
 * during that event, so {@link sourceFromTransfer} has to run inside the handler.
 */

/** A file handle with the permission calls TypeScript's DOM library leaves out. */
export interface SaveFileHandle extends FileSystemFileHandle {
  requestPermission?: (descriptor: { mode: "read" }) => Promise<PermissionState>;
}

export type SaveSource = { file: File; kind: "file" } | { handle: SaveFileHandle; kind: "handle" };

type HandleItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

/**
 * Whether drops & pastes give file handles here. Chrome & Edge do, & refuse their file picker in the
 * save folder; a browser without them, like Firefox, picks the live save from its picker instead.
 */
export function browserGivesHandles(): boolean {
  return "DataTransferItem" in globalThis && "getAsFileSystemHandle" in DataTransferItem.prototype;
}

/**
 * The save in a drop or a paste, or `undefined` when it carries no file. A handle that can't be read
 * falls back to the event's file, which is treated like one chosen in Firefox.
 */
export function sourceFromTransfer(
  transfer: DataTransfer | null | undefined,
): Promise<SaveSource | undefined> {
  const item: HandleItem | undefined = [...(transfer?.items ?? [])].find(
    ({ kind }) => kind === "file",
  );
  // Both must be asked for now: the transfer's contents are gone once the event ends.
  const file = item?.getAsFile() ?? transfer?.files[0];
  const asked = item?.getAsFileSystemHandle?.();
  return (async () => {
    const handle = await asked?.catch(() => null);
    if (handle?.kind === "file") return { handle: handle as SaveFileHandle, kind: "handle" };
    return file ? { file, kind: "file" } : undefined;
  })();
}

/** The file a source holds right now. A handle reads the file that's there at this moment. */
export function fileOf(source: SaveSource): File | Promise<File> {
  return source.kind === "handle" ? source.handle.getFile() : source.file;
}

/** Keeps the watched handle across visits. Only IndexedDB can hold one. */
export interface SaveHandleStore {
  clear: () => Promise<void>;
  load: () => Promise<SaveFileHandle | undefined>;
  save: (handle: SaveFileHandle) => Promise<void>;
}

const DATABASE = "mistria-fyi-sync";
const OBJECT_STORE = "handles";
const SAVE_KEY = "save";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(OBJECT_STORE);
    });
    request.addEventListener("success", () => {
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("IndexedDB failed"));
    });
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE, mode);
      const request = operation(transaction.objectStore(OBJECT_STORE));
      transaction.addEventListener("complete", () => {
        resolve(request.result);
      });
      transaction.addEventListener("abort", () => {
        reject(transaction.error ?? new Error("IndexedDB aborted"));
      });
    });
  } finally {
    database.close();
  }
}

/**
 * The handle store in this profile's IndexedDB. A private window can refuse it, which only costs the
 * next visit its handle, so nothing here throws.
 */
export const indexedDbHandleStore: SaveHandleStore = {
  async clear() {
    try {
      await run("readwrite", (store) => store.delete(SAVE_KEY));
    } catch {
      // Nothing was kept, or nothing can be.
    }
  },
  async load() {
    try {
      return await run<SaveFileHandle | undefined>(
        "readonly",
        (store) => store.get(SAVE_KEY) as IDBRequest<SaveFileHandle | undefined>,
      );
    } catch {
      return undefined;
    }
  },
  async save(handle) {
    try {
      await run("readwrite", (store) => store.put(handle, SAVE_KEY));
    } catch {
      // The handle still works for this visit.
    }
  },
};
