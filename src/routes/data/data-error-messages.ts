import * as m from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { formatNumber } from "#lib/utils/format.js";

import type { SaveImportWarning } from "#lib/engine/import-save.js";
import type { SavArchiveErrorDetail } from "#lib/engine/parse-sav.js";

// Localized text for the structured errors & warnings the save import engine returns.
// Save paths, file names, and IDs are save-format identifiers and stay untranslated.

export function formatSavArchiveError(detail: SavArchiveErrorDetail): string {
  switch (detail.code) {
    case "corrupt":
      return m.import_error_sav_corrupt({ tryAutosave: m.import_error_try_autosave() });
    case "decompressed-too-large":
      return m.import_error_sav_decompressed_too_large({
        max: formatBytes(detail.maxBytes),
        tryAutosave: m.import_error_try_autosave(),
      });
    case "invalid-entry":
      return m.import_error_sav_invalid_entry({
        entry: detail.entry,
        tryAutosave: m.import_error_try_autosave(),
      });
    case "no-save-data":
      return m.import_error_sav_no_save_data({ tryAutosave: m.import_error_try_autosave() });
    case "too-large":
      return m.import_error_sav_too_large({
        max: formatBytes(detail.maxBytes),
        size: formatBytes(detail.sizeBytes),
      });
  }
}

export function formatSaveImportWarning(warning: SaveImportWarning): string {
  switch (warning.code) {
    case "level":
      return formatLevelWarning(warning);
    case "not-a-list":
      return m.import_warning_not_a_list({ path: warning.path });
    case "not-an-object":
      return m.import_warning_not_an_object({ path: warning.path });
    case "unknown-id":
      return m.import_warning_unknown_id({ id: warning.id, path: warning.path });
    case "unreadable-entries":
      return m.import_warning_unreadable_entries({
        count: formatNumber(warning.count, getLocale()),
        path: warning.path,
      });
    case "unrecognized-player":
      return m.import_warning_unrecognized_player({ file: warning.file });
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
      return m.import_warning_level_above_max({
        key,
        max: formatNumber(warning.max, getLocale()),
        value,
      });
    case "negative":
      return m.import_warning_level_negative({ key, value });
    case "not-a-number":
      return m.import_warning_level_not_a_number({ key, value });
  }
}
