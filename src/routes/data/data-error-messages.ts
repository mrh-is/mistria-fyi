import * as m from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { formatNumber } from "#lib/utils/format.js";

import type { SaveFilesError, SaveImportWarning } from "#lib/engine/import-save.js";
import type { SaveFileErrorDetail } from "#lib/engine/parse-sav.js";
import type { TransferDecodeErrorCode } from "#lib/engine/transfer.js";

// Localized text for the structured errors & warnings the save import and transfer engines return.
// Save paths, file names, and IDs are save-format identifiers and stay untranslated.

export function formatSaveFileError(detail: SaveFileErrorDetail): string {
  switch (detail.code) {
    case "corrupt":
      return m.import_error_sav_corrupt();
    case "decompressed-too-large":
      return m.import_error_sav_decompressed_too_large({ max: formatBytes(detail.maxBytes) });
    case "invalid-entry":
      return m.import_error_sav_invalid_entry({ entry: detail.entry });
    case "no-save-data":
      return m.import_error_sav_no_save_data();
    case "too-large":
      return m.import_error_sav_too_large({
        max: formatBytes(detail.maxBytes),
        size: formatBytes(detail.sizeBytes),
      });
  }
}

/** The headline for a failed file import; list `problems` beneath it with formatSaveImportWarning. */
export function formatSaveFilesError(error: SaveFilesError): string {
  switch (error.code) {
    case "no-save-files":
      return m.import_error_no_save_files();
    case "no-valid-files":
      return m.import_error_no_valid_files();
  }
}

export function formatSaveImportWarning(warning: SaveImportWarning): string {
  switch (warning.code) {
    case "invalid-json":
      return m.import_warning_invalid_json({ file: warning.file });
    case "level":
      return formatLevelWarning(warning);
    case "not-a-list":
      return m.import_warning_not_a_list({ path: warning.path });
    case "not-an-object":
      return m.import_warning_not_an_object({ path: warning.path });
    case "not-json-object":
      return m.import_warning_not_json_object({ file: warning.file });
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

/** The message for a rejected transfer payload. `outdated` has its own recovery panel. */
export function formatTransferDecodeError(
  code: Exclude<TransferDecodeErrorCode, "outdated">,
): string {
  switch (code) {
    case "corrupt":
      return m.transfer_error_corrupt();
    case "newer-version":
      return m.transfer_error_newer_version();
    case "not-transfer-code":
      return m.transfer_error_not_transfer_code();
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
