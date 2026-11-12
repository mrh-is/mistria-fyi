import { getLocale } from "#lib/i18n/locale-runtime.js";
import { formatNumber } from "#lib/utils/format.js";

import type { SaveImportWarning } from "#lib/engine/import-save.js";
import type { SavArchiveErrorDetail } from "#lib/engine/parse-sav.js";

// Localized text for the structured errors & warnings the save import engine returns.
// Save paths, file names, and IDs are save-format identifiers and stay untranslated.

export function formatSavArchiveError(detail: SavArchiveErrorDetail): string {
  switch (detail.code) {
    case "corrupt":
      return `Hmm, we can’t read this as a Fields of Mistria save. It might be damaged, or a different file. Try the newest file that ends in “autosave”.`;
    case "decompressed-too-large":
      return `This file unpacks to more than ${formatBytes(detail.maxBytes)}, which is way bigger than a real save. It might be damaged. Try the newest file that ends in “autosave”.`;
    case "invalid-entry":
      return `We couldn’t read the ${detail.entry} part of this save, so it might be damaged. Try the newest file that ends in “autosave”.`;
    case "no-save-data":
      return `We couldn’t find any progress in this file. Try the newest file that ends in “autosave”.`;
    case "too-large":
      return `Mamma mia, that’s a big file. This app can only read save files up to ${formatBytes(detail.maxBytes)}, and that file is ${formatBytes(detail.sizeBytes)}. Maybe double-check you picked the right one?`;
  }
}

export function formatSaveImportWarning(warning: SaveImportWarning): string {
  switch (warning.code) {
    case "level":
      return formatLevelWarning(warning);
    case "not-a-list":
      return `${warning.path} isn’t a list; skipped`;
    case "not-an-object":
      return `${warning.path} isn’t an object; skipped`;
    case "unknown-id":
      return `${warning.path}: unrecognized ID ${warning.id}; skipped`;
    case "unreadable-entries":
      return `${warning.path}: unreadable entries skipped (${formatNumber(warning.count, getLocale())})`;
    case "unrecognized-player":
      return `${warning.file} has no recognized progress fields; skipped`;
  }
}

/** Binary sizes, matching the engine's limits, with locale-formatted numbers & unit labels. */
function scaleBytes(bytes: number): [value: number, unit: string] {
  if (bytes < 1024) return [bytes, "byte"];
  if (bytes < 1024 * 1024) return [bytes / 1024, "kilobyte"];
  return [bytes / (1024 * 1024), "megabyte"];
}

function formatBytes(bytes: number): string {
  const [value, unit] = scaleBytes(bytes);
  return new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 1,
    style: "unit",
    unit,
  }).format(value);
}

function formatLevelWarning(warning: Extract<SaveImportWarning, { code: "level" }>): string {
  const { key, value } = warning;
  switch (warning.issue) {
    case "above-max":
      return `${key} is ${value}, above the maximum of ${formatNumber(warning.max, getLocale())}; imported as ${formatNumber(warning.max, getLocale())}`;
    case "negative":
      return `${key} is ${value}, which is negative; skipped`;
    case "not-a-number":
      return `${key} is ${value}, which isn’t a number; skipped`;
  }
}
