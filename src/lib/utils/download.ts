/** Saves `json` as a dated `.json` file named after `prefix`. */
export function downloadJson(json: string, prefix: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The file name prefix of a progress backup. */
export const BACKUP_FILE_PREFIX = "mistria-field-guide-backup";
