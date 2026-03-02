/**
 * Utilities for file picker support with fallback.
 */

export async function pickFiles(): Promise<File[] | null> {
  if (supportsShowOpenFilePicker()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
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

      const file = await handles[0].getFile();
      return [file];
    } catch (err) {
      // User cancelled
      if (err instanceof DOMException && err.name === "AbortError") {
        return null;
      }
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
 * Check whether the File System Access API is available.
 */
export function supportsShowOpenFilePicker(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}
