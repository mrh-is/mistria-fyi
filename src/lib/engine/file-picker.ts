/**
 * Utilities for file picker support with fallback and persistence.
 */

const FILE_HANDLE_STORAGE_KEY = "importFileHandle";

export function hasSavedFileHandle(): boolean {
  try {
    return sessionStorage.getItem(FILE_HANDLE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export async function pickFiles(): Promise<File[] | null> {
  if (supportsShowOpenFilePicker()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        startIn: getSavedFileHandle() ?? undefined,
        types: [
          {
            accept: {
              "application/json": [".json"],
              "application/octet-stream": [".sav"],
            },
            description: "Save files",
          },
        ],
      });

      if (!handles.length) {
        return null;
      }

      const [pickedHandle] = handles;

      // Save the first handle for later use
      saveFileHandle(pickedHandle);

      // Get the file from the handle
      const file = await pickedHandle.getFile();
      return [file];
    } catch (err) {
      // User cancelled or API error; fall through to fallback
      if (err instanceof DOMException && err.name === "AbortError") {
        return null;
      }
      // For other errors, could throw or fall through to fallback
      throw err;
    }
  }

  // Fallback to input element
  return new Promise<File[] | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".sav,.json";

    const handleChange = (event: Event) => {
      const files = (event.target as HTMLInputElement).files;
      input.removeEventListener("change", handleChange);
      resolve(files ? Array.from(files) : null);
    };

    input.addEventListener("change", handleChange);
    input.click();
  });
}

/**
 * Show native file picker and return selected files.
 * Falls back gracefully if showOpenFilePicker is not supported.
 */
export function supportsShowOpenFilePicker(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/**
 * Retrieve a previously saved file handle from sessionStorage.
 */
function getSavedFileHandle(): FileSystemFileHandle | null {
  if (!supportsShowOpenFilePicker()) {
    return null;
  }

  try {
    const stored = sessionStorage.getItem(FILE_HANDLE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as FileSystemFileHandle | null;
    }
  } catch {
    // Ignore errors reading/parsing sessionStorage
  }

  return null;
}

/**
 * Save a file handle to sessionStorage for later reuse.
 */
function saveFileHandle(handle: FileSystemFileHandle): void {
  try {
    sessionStorage.setItem(FILE_HANDLE_STORAGE_KEY, JSON.stringify(handle));
  } catch {
    // Ignore if sessionStorage fails
  }
}
