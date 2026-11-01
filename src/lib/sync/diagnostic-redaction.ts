/** Private comparison inputs for game-owned IDs; none of these belong in the public log. */
export interface PrivateValues {
  credentials: (null | string | undefined)[];
  farmNames: (null | string | undefined)[];
  farmNumbers: (null | string | undefined)[];
  playerNames: (null | string | undefined)[];
}

interface DiagnosticRedaction {
  id: (value: string) => string;
  remember: (values: Partial<PrivateValues>) => void;
}

const REDACTED = "[redacted]";
/** Keep ordinary words such as `almanac` readable for a player named “Al”. */
const MIN_SUBSTRING_NAME = 3;
/** Separate from the public event budget; private patterns live only in this tab's closure. */
const MAX_PRIVATE_PATTERN_BYTES = 16 * 1024;
const ROMANIZED: Readonly<Record<string, string>> = {
  æ: "ae",
  đ: "d",
  ð: "d",
  ı: "i",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

/** Fold names on both sides; keep acronym boundaries too, as in `BONote` → `BO Note`. */
function nameWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .replaceAll(
      /(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/gu,
      " ",
    )
    .toLowerCase()
    .replaceAll(/[æðđıłøœßþ]/gu, (letter) => ROMANIZED[letter])
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function isString(value: null | string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Unknown IDs come from game ID lists, not arbitrary save text. Preserve them unless they contain
 * a known private value or cannot fit the public ID shape. Do not guess personal information from
 * dates, digit runs, or similar patterns. See the source-based feedback redaction decision.
 */
export function createDiagnosticRedaction(): DiagnosticRedaction {
  const exact = new Set<string>();
  const names = new Set<string>();
  let bytes = 0;
  let redactAll = false;

  function rememberPattern(set: Set<string>, value: string): void {
    if (redactAll || !value || set.has(value)) return;
    const size = new TextEncoder().encode(value).byteLength;
    if (bytes + size > MAX_PRIVATE_PATTERN_BYTES) {
      // Never forget a secret while retaining IDs that might contain it. Exhausting the private
      // budget conservatively hides all IDs for the rest of this tab's session.
      redactAll = true;
      exact.clear();
      names.clear();
      return;
    }
    set.add(value);
    bytes += size;
  }

  return {
    id(value: string): string {
      if (value === REDACTED) return value;
      if (redactAll || !/^[\w.:[\]-]{1,100}$/u.test(value)) return REDACTED;
      const lower = value.toLowerCase();
      for (const secret of exact) {
        if (lower.includes(secret)) return REDACTED;
      }
      const words = nameWords(value);
      const joined = words.join("");
      for (const name of names) {
        if (name.length < MIN_SUBSTRING_NAME ? words.includes(name) : joined.includes(name)) {
          return REDACTED;
        }
      }
      return value;
    },
    remember({
      credentials = [],
      farmNames = [],
      farmNumbers = [],
      playerNames = [],
    }: Partial<PrivateValues>): void {
      for (const value of [...credentials, ...farmNumbers].filter((entry) => isString(entry))) {
        rememberPattern(exact, value.toLowerCase());
      }
      for (const value of playerNames.filter((entry) => isString(entry))) {
        const words = nameWords(value);
        for (const name of [words.join(""), ...words]) rememberPattern(names, name);
      }
      // A farm's name counts as a whole: its individual words are often “rose” or “farm”.
      for (const value of farmNames.filter((entry) => isString(entry))) {
        rememberPattern(names, nameWords(value).join(""));
      }
    },
  };
}
