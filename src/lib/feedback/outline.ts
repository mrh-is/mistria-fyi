/**
 * Lays out a feedback attachment as a plain outline for the preview sheet: `key: value` per line,
 * two-space nesting, `- ` for list items, & no quotes, braces, or commas between entries. This is
 * only how an attachment is shown; the payload stays JSON.
 */

export type OutlineValueKind = "boolean" | "empty" | "null" | "number" | "redacted" | "text";

export interface OutlineLine {
  /** Starts with `- `, as a list item. */
  dash: boolean;
  /** Column where a wrapped line continues: just past `key: `, or past the dash. */
  hang: number;
  key?: string;
  /** Column where the line starts. */
  lead: number;
  value?: { kind: OutlineValueKind; text: string };
}

/** How `progressAttachment` marks a value it took out. */
const REDACTED = "[redacted]";
/** Stands in for an empty object, list, or string, which an outline can't otherwise show. */
const EMPTY = "—";

type Scalar = boolean | null | number | string;

function isScalar(value: unknown): value is Scalar {
  return value === null || typeof value !== "object";
}

function isEmpty(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && value !== null) return Object.keys(value).length === 0;
  return value === "";
}

/** A value that takes lines of its own: a non-empty object, or a list holding one. */
function isNested(value: unknown): value is object {
  if (isScalar(value) || isEmpty(value)) return false;
  return !Array.isArray(value) || !value.every((item) => isScalar(item));
}

function scalarKind(value: unknown): OutlineValueKind {
  if (isEmpty(value)) return "empty";
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return value === REDACTED ? "redacted" : "text";
}

function scalarText(value: unknown): string {
  if (isEmpty(value)) return EMPTY;
  if (value === null) return "null";
  // A newline would break the hanging indent, so a line break shows as a mark instead.
  if (typeof value === "string") return value.replaceAll(/\r?\n/g, " ↵ ");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** A plain value, or a list of plain values joined on one line. */
function shownValue(value: unknown): NonNullable<OutlineLine["value"]> {
  if (Array.isArray(value) && value.length > 0) {
    const kinds = new Set(value.map((item) => scalarKind(item)));
    return {
      kind: kinds.size === 1 ? [...kinds][0] : "text",
      text: value.map((item) => scalarText(item)).join(", "),
    };
  }
  return { kind: scalarKind(value), text: scalarText(value) };
}

function entriesOf(value: object): [string, unknown][] {
  return Object.entries(value);
}

function pushEntry(out: OutlineLine[], lead: number, key: string, value: unknown, dash = false) {
  const keyStart = lead + (dash ? 2 : 0);
  const hang = keyStart + key.length + 2;
  if (isNested(value)) {
    out.push({ dash, hang, key, lead });
    // A list item's later keys line up under its first, so its children sit two past that.
    pushChildren(out, keyStart + 2, value);
  } else {
    out.push({ dash, hang, key, lead, value: shownValue(value) });
  }
}

function pushItem(out: OutlineLine[], lead: number, item: unknown) {
  if (isScalar(item) || isEmpty(item)) {
    out.push({ dash: true, hang: lead + 2, lead, value: shownValue(item) });
  } else if (Array.isArray(item)) {
    out.push({ dash: true, hang: lead + 2, lead });
    pushChildren(out, lead + 2, item);
  } else {
    const [[firstKey, firstValue], ...rest] = entriesOf(item as object);
    pushEntry(out, lead, firstKey, firstValue, true);
    for (const [key, value] of rest) pushEntry(out, lead + 2, key, value);
  }
}

function pushChildren(out: OutlineLine[], lead: number, value: object) {
  if (Array.isArray(value)) {
    for (const item of value) pushItem(out, lead, item);
  } else {
    for (const [key, child] of entriesOf(value)) pushEntry(out, lead, key, child);
  }
}

export function outlineLines(data: unknown): OutlineLine[] {
  // Outline what the payload carries: JSON drops undefined values & turns them to null in lists.
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON's rules are the point; structuredClone keeps undefined
  const value: unknown = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
  if (!isNested(value)) return [{ dash: false, hang: 0, lead: 0, value: shownValue(value) }];
  const out: OutlineLine[] = [];
  pushChildren(out, 0, value);
  return out;
}

/** The outline as plain text, one line each, as a reader would copy it. */
export function outlineText(value: unknown): string {
  return outlineLines(value)
    .map((line) => {
      const dash = line.dash ? "- " : "";
      const key = line.key === undefined ? "" : `${line.key}:`;
      const shown = line.value?.text ?? "";
      const gap = key && shown ? " " : "";
      return `${" ".repeat(line.lead)}${dash}${key}${gap}${shown}`;
    })
    .join("\n");
}
