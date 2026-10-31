import { compareStrings } from "../ordering.js";

import type { ItemId, ItemVariant } from "#lib/types/tracker-data.js";

import type { ItemVariantSet } from "../overrides/item-variants.js";

/** Rows of one almanac category that show the same English name, by canonical item ID. */
export interface SameNameRowSet {
  ids: string[];
  name: string;
}

/** What {@link proposeItemVariants} suggests for a set the reviewed table doesn’t cover yet. */
export type ItemVariantProposal =
  | {
      from: "description" | "id";
      kind: "named";
      /** Each row’s differentiator, in the game’s English wording. */
      phrases: Record<string, string>;
      /** Why a human should look before this is committed; empty when it’s clear-cut. */
      review: string[];
    }
  | { kind: "unnamed"; reason: string };

/**
 * Groups `rows` (canonical ID & English name, one per almanac entry) by name, keeping only names
 * that more than one row shares. Sets & their IDs come back sorted, so errors read the same on
 * every run.
 */
export function findSameNameRowSets(
  rows: readonly { id: string; name: string }[],
): SameNameRowSet[] {
  const byName = new Map<string, string[]>();
  for (const { id, name } of rows) byName.set(name, [...(byName.get(name) ?? []), id]);
  return [...byName]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ ids: ids.toSorted(compareStrings), name }))
    .toSorted((a, b) => compareStrings(a.name, b.name));
}

/**
 * Checks every same-name set against the reviewed table and returns each named row’s variant. It
 * throws when a set isn’t covered, when a set’s rows or descriptions no longer match their review,
 * when a set’s variants don’t tell its rows apart, & when a reviewed set no longer occurs. A new
 * game version therefore forces review instead of shipping unnamed or stale rows.
 */
export function resolveItemVariants(
  sets: readonly SameNameRowSet[],
  descriptions: Readonly<Record<string, string | undefined>>,
  reviewed: readonly ItemVariantSet[],
): Map<ItemId, ItemVariant> {
  const reviewByKey = new Map(reviewed.map((set) => [setKey(reviewedIds(set)), set]));
  const unmatched = new Set(reviewByKey.keys());
  const variants = new Map<ItemId, ItemVariant>();
  const errors: string[] = [];

  for (const set of sets) {
    const key = setKey(set.ids);
    const review = reviewByKey.get(key);
    if (!review) {
      errors.push(
        `Same-name almanac rows “${set.name}” (${set.ids.join(", ")}) aren’t in the reviewed table; proposal: ${JSON.stringify(proposeItemVariants(set, descriptions))}`,
      );
      continue;
    }
    unmatched.delete(key);
    if (review.name !== set.name) {
      errors.push(`Reviewed set “${review.name}” is now named “${set.name}”`);
    }
    if (!("named" in review)) continue;

    const seen = new Set<ItemVariant>();
    for (const [id, { description, variant }] of Object.entries(review.named)) {
      if (descriptions[id] !== description) {
        errors.push(
          `Reviewed description for “${id}” changed: ${JSON.stringify(description)} → ${JSON.stringify(descriptions[id])}`,
        );
      }
      if (seen.has(variant)) errors.push(`Reviewed set “${set.name}” repeats variant “${variant}”`);
      seen.add(variant);
      variants.set(id as ItemId, variant);
    }
  }

  for (const key of unmatched) {
    const review = reviewByKey.get(key);
    errors.push(
      `Reviewed set “${review?.name ?? key}” (${key}) no longer matches any same-name almanac rows`,
    );
  }
  if (errors.length > 0) {
    throw new Error(`Item variant review is out of date:\n  - ${errors.join("\n  - ")}`);
  }
  return variants;
}

/**
 * Applies the review rules to one set: description first, ID second, all or nothing. Each row’s
 * differentiator is what its text doesn’t share with every other row, so shared wording (“left
 * version”) never becomes part of a name, and IDs that differ mid-stem still diff cleanly. A set
 * where any row has no differentiator stays unnamed, as does one whose IDs differ only by a bare
 * version number (`_v1`, `_v2`).
 */
export function proposeItemVariants(
  set: SameNameRowSet,
  descriptions: Readonly<Record<string, string | undefined>>,
): ItemVariantProposal {
  const texts = set.ids.map((id) => descriptions[id] ?? "");
  if (new Set(texts).size === texts.length) {
    const diffs = differingTokens(texts.map((text) => text.match(/[\w'-]+|[^\w\s]/g) ?? []));
    const phrases = diffs.map((tokens) => toPhrase(tokens));
    if (phrases.every(Boolean)) {
      const review = sharesInnerToken(diffs)
        ? ["The descriptions differ in more than one phrase; pick the one that names the row."]
        : [];
      return { from: "description", kind: "named", phrases: zip(set.ids, phrases), review };
    }
    return { kind: "unnamed", reason: "At least one description names no difference." };
  }
  if (new Set(texts).size > 1) {
    return { kind: "unnamed", reason: "Some descriptions match while others differ." };
  }

  const phrases = differingTokens(set.ids.map((id) => id.split("_"))).map((tokens) =>
    tokens.join(" "),
  );
  if (phrases.every((phrase) => phrase && !/^v\d+$/.test(phrase))) {
    return {
      from: "id",
      kind: "named",
      phrases: zip(set.ids, phrases),
      review: ["Named from IDs alone; check that each ID word is a player-facing name."],
    };
  }
  return { kind: "unnamed", reason: "Identical descriptions, and the IDs name no difference." };
}

function reviewedIds(set: ItemVariantSet): string[] {
  return "named" in set ? Object.keys(set.named) : [...set.unnamed];
}

function setKey(ids: readonly string[]): string {
  return ids.toSorted(compareStrings).join(", ");
}

/** Strips the tokens every sequence shares at its start & end, leaving each one’s difference. */
function differingTokens(sequences: readonly string[][]): string[][] {
  const shortest = Math.min(...sequences.map((tokens) => tokens.length));
  const sharedAt = (index: (tokens: string[]) => string): boolean =>
    new Set(sequences.map((tokens) => index(tokens).toLowerCase())).size === 1;
  let start = 0;
  while (start < shortest && sharedAt((tokens) => tokens[start])) start++;
  let end = 0;
  while (end < shortest - start && sharedAt((tokens) => tokens[tokens.length - 1 - end])) end++;
  return sequences.map((tokens) => tokens.slice(start, tokens.length - end));
}

/** Whether a token occurs inside every difference, splitting each into more than one phrase. */
function sharesInnerToken(diffs: readonly string[][]): boolean {
  const [first, ...rest] = diffs.map(
    (tokens) => new Set(tokens.map((token) => token.toLowerCase())),
  );
  return [...first].some((token) => rest.every((tokens) => tokens.has(token)));
}

/** Drops leading articles & trailing punctuation: “An orange” → “orange”. */
function toPhrase(tokens: readonly string[]): string {
  const words = [...tokens];
  while (words.length > 0 && /^(a|an)$/i.test(words[0])) words.shift();
  while (words.length > 0 && /^[^\w]+$/.test(words.at(-1) ?? "")) words.pop();
  return words.join(" ").toLowerCase();
}

function zip(ids: readonly string[], phrases: readonly string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id, index) => [id, phrases[index]]));
}
