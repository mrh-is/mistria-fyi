const MAX_DETAILS_LENGTH = 300;
const REDACTED = "[redacted]";
/** Quoted fragments can echo the failing input, such as a farm name from a save file's own text. */
const QUOTED = /"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”/gu;

/**
 * Summarizes an exception for a feedback draft the player reviews before sending. It keeps the
 * error's name & message, redacts quoted fragments, and caps the length. Returns `undefined` for a
 * thrown value that isn't an `Error`, since there's nothing safe to describe.
 */
export function describeErrorForReport(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const message = error.message.replaceAll(QUOTED, REDACTED).replaceAll(/\s+/gu, " ").trim();
  const details = message ? `${error.name}: ${message}` : error.name;
  return details.length > MAX_DETAILS_LENGTH
    ? `${details.slice(0, MAX_DETAILS_LENGTH - 1)}…`
    : details;
}
