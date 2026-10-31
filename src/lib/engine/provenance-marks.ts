/**
 * The mark a checked box draws. Its shape is the status: a slash for obtained, an X for completed.
 * Provenance only picks the tool that drew it, and the fact's key seeds the tool's variation, so a
 * row's mark never changes but no two rows match. Pure: `tracker-checkbox.svelte` renders it.
 *
 * Every mark is drawn in the checkbox's 28-unit viewBox. The order of the random draws fixes each
 * mark, so keep it stable. See `docs/decisions/2026-10-30-provenance-marks.md`.
 */
import type { ProvenanceSource } from "./provenance.js";

export type MarkElement =
  | { animated?: boolean; d: string; kind: "stroke"; opacity?: number; width: string }
  | { cx: string; cy: string; kind: "dot"; r: string }
  | { kind: "bar"; transform: string };

/** Uneven stamp pressure: a white-to-grey ramp, as a mask, across the 28-unit box. */
export interface MarkPressure {
  end: number;
  x1: string;
  x2: string;
  y1: string;
  y2: string;
}

export interface MarkLayer {
  elements: readonly MarkElement[];
  filter: string;
  opacity?: number;
  pressure?: MarkPressure;
  roundCaps?: boolean;
  transform?: string;
}

/** Each tool's filter variations, so the app defines a few filters rather than one per mark. */
export const MARK_FILTER_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const BOX_CENTER = 14;
/** The colored pencil's strength relative to the pen. */
const PENCIL_WEIGHT = 0.75;

type Random = () => number;

/** A seeded generator (FNV-1a into mulberry32). */
function randomFrom(key: string): Random {
  let a = 2_166_136_261;
  for (const char of key) a = Math.imul(a ^ (char.codePointAt(0) ?? 0), 16_777_619);
  return () => {
    // Wraps to 32 bits, which `Math.trunc` wouldn't.
    a = Math.imul(a + 0x6d_2b_79_f5, 1);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function between(random: Random, low: number, high: number): number {
  return low + random() * (high - low);
}

function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function pickFilter(random: Random, tool: "pen" | "pencil" | "ribbon" | "stamp"): string {
  const seed = MARK_FILTER_SEEDS[Math.floor(random() * MARK_FILTER_SEEDS.length)];
  return `url(#mark-${tool}-${String(seed)})`;
}

/** Where a later stroke lands, a little out of register with the first. */
function misregister(random: Random): string {
  const x = fixed(between(random, -0.9, 0.9), 2);
  const y = fixed(between(random, -0.7, 0.7), 2);
  const angle = fixed(between(random, -3, 3));
  return `translate(${x} ${y}) rotate(${angle} ${String(BOX_CENTER)} ${String(BOX_CENTER)})`;
}

/** A fade in a random direction, by 0 to about 45%. About a fifth don't fade at all. */
function pressure(random: Random): MarkPressure {
  const angle = between(random, 0, 2 * Math.PI);
  const fade = Math.max(0, between(random, -0.1, 0.45));
  const dx = Math.cos(angle) * 8;
  const dy = Math.sin(angle) * 8;
  return {
    end: Math.round(255 * (1 - fade)),
    x1: fixed(BOX_CENTER - dx, 2),
    x2: fixed(BOX_CENTER + dx, 2),
    y1: fixed(BOX_CENTER - dy, 2),
    y2: fixed(BOX_CENTER + dy, 2),
  };
}

/** The moments of one tool's mark, each a layer or two. */
interface ToolMark {
  /** The crossing stroke alone, landing later. */
  cross: () => MarkLayer[];
  /** Obtained, then done: the slash, then the crossing stroke a little out of register. */
  quest: () => MarkLayer[];
  slash: () => MarkLayer[];
  /** One moment: both strokes at once. */
  x: () => MarkLayer[];
}

/** Today's X, loosened: each stroke's ends, bow, & weight vary, and a nib blot starts it. */
function pen(random: Random): ToolMark {
  const filter = pickFilter(random, "pen");
  const later = misregister(random);
  const hand = (
    [startX, startY]: [number, number],
    [endX, endY]: [number, number],
    animated: boolean,
  ): MarkElement[] => {
    const x0 = startX + between(random, -1.6, 1.6);
    const y0 = startY + between(random, -1.6, 1.6);
    const x1 = endX + between(random, -1.8, 1.8);
    const y1 = endY + between(random, -1.8, 1.8);
    const length = Math.hypot(x1 - x0, y1 - y0);
    const normalX = -(y1 - y0) / length;
    const normalY = (x1 - x0) / length;
    const bow = between(random, -1.8, 1.8);
    const bow2 = bow * between(random, 0.3, 1.3);
    const at = (t: number, offset: number): string =>
      `${fixed(x0 + (x1 - x0) * t + normalX * offset)} ${fixed(y0 + (y1 - y0) * t + normalY * offset)}`;
    const control1 = at(between(random, 0.25, 0.4), bow);
    const control2 = at(between(random, 0.6, 0.75), bow2);
    const r = between(random, 1.1, 1.7);
    const width = between(random, 2.1, 2.8);
    return [
      {
        ...(animated ? { animated } : {}),
        d: `M${fixed(x0)} ${fixed(y0)} C${control1} ${control2} ${fixed(x1)} ${fixed(y1)}`,
        kind: "stroke",
        width: fixed(width, 2),
      },
      { cx: fixed(x0, 2), cy: fixed(y0, 2), kind: "dot", r: fixed(r, 2) },
    ];
  };
  const first = hand([21.9, 3.1], [6.6, 21.7], false);
  const second = hand([7.4, 7.6], [25.6, 24.1], true);
  const slash: MarkLayer = { elements: first, filter, roundCaps: true };
  const cross: MarkLayer = { elements: second, filter, roundCaps: true };
  const crossLater: MarkLayer = { ...cross, transform: later };
  return {
    cross: () => [crossLater],
    quest: () => [slash, crossLater],
    slash: () => [slash],
    x: () => [slash, cross],
  };
}

/** Square-ended bars, set a few degrees off, with specks the ink missed & a pressure fade. */
function stamp(random: Random): ToolMark {
  const filter = pickFilter(random, "stamp");
  const first = `rotate(${fixed(between(random, -5, 5))} ${String(BOX_CENTER)} ${String(BOX_CENTER)})`;
  const firstPressure = pressure(random);
  const later = misregister(random);
  const laterPressure = pressure(random);
  const bar = (angle: number): MarkElement => ({
    kind: "bar",
    transform: `rotate(${String(angle)} ${String(BOX_CENTER)} ${String(BOX_CENTER)})`,
  });
  const slash: MarkLayer = {
    elements: [bar(-45)],
    filter,
    pressure: firstPressure,
    transform: first,
  };
  const cross: MarkLayer = {
    elements: [bar(45)],
    filter,
    pressure: laterPressure,
    transform: `${first} ${later}`,
  };
  return {
    cross: () => [cross],
    quest: () => [slash, cross],
    slash: () => [slash],
    x: () => [{ ...slash, elements: [bar(-45), bar(45)] }],
  };
}

/** Two light, grainy passes per stroke, inside the box. */
function pencil(random: Random): ToolMark {
  const filter = pickFilter(random, "pencil");
  const later = misregister(random);
  const stroke = (d: string, d2: string): MarkLayer => ({
    elements: [
      { d, kind: "stroke", width: "1.6" },
      { d: d2, kind: "stroke", opacity: 0.6, width: "0.9" },
    ],
    filter,
    opacity: PENCIL_WEIGHT,
    roundCaps: true,
  });
  const slash = stroke(
    "M9.3 19.9 C12.1 16.5 15.2 12.5 18.9 8.2",
    "M9.9 20.2 C12.6 16.9 15.6 13 19.1 8.9",
  );
  const cross = stroke(
    "M9.1 8.5 C12.3 12 15.7 16 19.2 19.8",
    "M9.6 8.2 C12.8 11.6 16.1 15.4 19.5 19.1",
  );
  const crossLater: MarkLayer = { ...cross, transform: later };
  return {
    cross: () => [crossLater],
    quest: () => [slash, crossLater],
    slash: () => [slash],
    x: () => [slash, cross],
  };
}

const TYPED_SLASH: readonly MarkElement[] = [
  { d: "M17.5 10.4 L10.7 18.4", kind: "stroke", width: "1.75" },
  { d: "M15.9 10.4 H19 M9.2 18.4 H12.3", kind: "stroke", width: "1.25" },
];
const TYPED_BACKSLASH: readonly MarkElement[] = [
  { d: "M10.7 10.4 L17.5 18.4", kind: "stroke", width: "1.75" },
  { d: "M9.2 10.4 H12.3 M15.9 18.4 H19", kind: "stroke", width: "1.25" },
];

/** A small serifed x, struck a hair off level. A quest types `/`, then `\` a little further on. */
function typewriter(random: Random): ToolMark {
  const filter = pickFilter(random, "ribbon");
  const x = fixed(between(random, -0.4, 0.4), 2);
  const y = fixed(between(random, -0.3, 0.5), 2);
  const angle = fixed(between(random, -2.5, 2.5));
  const first = `translate(${x} ${y}) rotate(${angle} ${String(BOX_CENTER)} ${String(BOX_CENTER)})`;
  const later = misregister(random);
  const slash: MarkLayer = { elements: TYPED_SLASH, filter, transform: first };
  const cross: MarkLayer = { elements: TYPED_BACKSLASH, filter, transform: `${first} ${later}` };
  return {
    cross: () => [cross],
    quest: () => [slash, cross],
    slash: () => [slash],
    x: () => [{ ...slash, elements: [...TYPED_SLASH, ...TYPED_BACKSLASH] }],
  };
}

const TOOLS: Readonly<Record<ProvenanceSource, (random: Random) => ToolMark>> = {
  inferred: pencil,
  manual: pen,
  save: stamp,
  unknown: typewriter,
};

export interface MarkInput {
  /** Seeds the mark: the fact's key, so a row always draws the same one. */
  fact: string;
  /** See `FactProvenance.obtainedSource`. */
  obtainedSource?: ProvenanceSource;
  source: ProvenanceSource;
  state: "checked" | "obtained";
  /** A quest: obtained, then finished, so its X takes two moments rather than one. */
  twoMoments: boolean;
}

/** The layers of a checked box's mark, in paint order. */
export function provenanceMark({
  fact,
  obtainedSource,
  source,
  state,
  twoMoments,
}: MarkInput): MarkLayer[] {
  const random = randomFrom(fact);
  if (obtainedSource !== undefined && obtainedSource !== source && state === "checked") {
    // Each moment keeps its own tool, and the slash is the one this quest drew when obtained.
    const obtained = TOOLS[obtainedSource](random);
    return [...obtained.slash(), ...TOOLS[source](random).cross()];
  }
  const tool = TOOLS[source](random);
  if (state === "obtained") return tool.slash();
  return twoMoments ? tool.quest() : tool.x();
}
