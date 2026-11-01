/** The game's save folder on each platform (`docs/sync-setup.md` § Save folders). */
export type SaveFolderPlatform = "linux" | "mac" | "windows";

export const SAVE_FOLDERS: Readonly<Record<SaveFolderPlatform, string>> = {
  linux:
    "~/.local/share/Steam/steamapps/compatdata/2142790/pfx/drive_c/users/steamuser/AppData/Local/FieldsOfMistria/saves",
  mac: "~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/AppData/Local/FieldsOfMistria/saves",
  windows: String.raw`%LOCALAPPDATA%\FieldsOfMistria\saves`,
};

/** The platform whose copy a surface with no platform picker of its own shows. */
export function guessPlatform(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): SaveFolderPlatform {
  if (userAgent.includes("Macintosh")) return "mac";
  if (userAgent.includes("Linux") || userAgent.includes("X11")) return "linux";
  return "windows";
}

/** An example file name, shown as the folder's contents. */
export const AUTOSAVE_EXAMPLE = "game-[numbers]-autosave.sav";

/**
 * Whether a `copy` event copied the folder path: the selection sits inside `path`. A manual copy
 * lifts the drop box's gate the same way the button does.
 */
export function copiedFromPath(selection: null | Selection, path: Node): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return path.contains(range.commonAncestorContainer);
}
