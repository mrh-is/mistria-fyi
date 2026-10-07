import { compareStrings } from "../ordering.js";

import type {
  AnimalId,
  CosmeticId,
  ItemId,
  PetCosmeticSetId,
  RecipeId,
} from "#lib/types/tracker-data.js";

import type { PipelineSource as Source } from "./pipeline-source.js";

export interface SourceProvenance {
  fieldPath: string;
  sourcePath: string;
}

const provenanceBySource = new WeakMap<object, Map<string, SourceProvenance>>();

export type AnimalCosmeticKey = `${AnimalId}:${CosmeticId}`;

abstract class SourceAccumulator<TargetId extends string> {
  readonly #sourcesByTarget = new Map<TargetId, Map<string, Source>>();

  readonly #targetNamespace: string;

  protected constructor(targetNamespace: string) {
    this.#targetNamespace = targetNamespace;
  }

  add(targetId: TargetId, source: Source, provenance?: SourceProvenance): void {
    let sources = this.#sourcesByTarget.get(targetId);
    if (!sources) {
      sources = new Map();
      this.#sourcesByTarget.set(targetId, sources);
    }

    const identity = canonicalSourceJson(source);
    if (!sources.has(identity)) {
      sources.set(identity, source);
      if (provenance) {
        let provenanceByTarget = provenanceBySource.get(source);
        if (!provenanceByTarget) {
          provenanceByTarget = new Map();
          provenanceBySource.set(source, provenanceByTarget);
        }
        provenanceByTarget.set(`${this.#targetNamespace}.${targetId}`, provenance);
      }
    }
  }

  entries(): [TargetId, Source[]][] {
    return [...this.#sourcesByTarget.entries()]
      .toSorted(([left], [right]) => compareStrings(left, right))
      .map(([targetId, sources]) => [targetId, sortedSources(sources)]);
  }

  get(targetId: TargetId): Source[] {
    return sortedSources(this.#sourcesByTarget.get(targetId));
  }

  replace(targetId: TargetId, sources: Source[], provenance?: SourceProvenance): void {
    this.#sourcesByTarget.delete(targetId);
    for (const source of sources) {
      this.add(targetId, source, provenance);
    }
  }

  toRecord(): Record<TargetId, Source[]> {
    return Object.fromEntries(this.entries()) as Record<TargetId, Source[]>;
  }
}

function sortedSources(sources: Map<string, Source> | undefined): Source[] {
  if (!sources) return [];
  return [...sources.entries()]
    .map(([, source]) => source)
    .toSorted(
      (left, right) =>
        compareStrings(legacySourceSortJson(left), legacySourceSortJson(right)) ||
        compareStrings(canonicalSourceJson(left), canonicalSourceJson(right)),
    );
}

export class AnimalCosmeticSourceAccumulator {
  readonly #inner = new (class extends SourceAccumulator<AnimalCosmeticKey> {
    constructor() {
      super("animalCosmetics");
    }
  })();

  add(
    animalId: AnimalId,
    cosmeticId: CosmeticId,
    source: Source,
    provenance?: SourceProvenance,
  ): void {
    this.#inner.add(`${animalId}:${cosmeticId}`, source, provenance);
  }

  animalCosmeticEntries(): {
    animalId: AnimalId;
    cosmeticId: CosmeticId;
    sources: Source[];
  }[] {
    return this.#inner.entries().map(([key, sources]) => {
      const [animalId, cosmeticId] = key.split(":") as [AnimalId, CosmeticId];
      return {
        animalId,
        cosmeticId,
        sources,
      };
    });
  }

  get(animalId: AnimalId, cosmeticId: CosmeticId): Source[] {
    return this.#inner.get(`${animalId}:${cosmeticId}`);
  }
}

export class CosmeticSourceAccumulator extends SourceAccumulator<CosmeticId> {
  constructor() {
    super("cosmetics");
  }
}

export class ItemSourceAccumulator extends SourceAccumulator<ItemId> {
  constructor() {
    super("items");
  }
}

export class PetCosmeticSourceAccumulator extends SourceAccumulator<PetCosmeticSetId> {
  constructor() {
    super("petCosmetics");
  }
}

export class RecipeSourceAccumulator extends SourceAccumulator<RecipeId> {
  constructor() {
    super("recipes");
  }
}

export function canonicalSourceJson(source: Source): string {
  // A source's gate is part of its identity. Distinct gates represent distinct acquisition
  // alternatives; dropping one would make the result depend on collector order.
  return stableJson(source);
}

function legacySourceSortJson(source: Source): string {
  const { stockGate, ...publicSource } = source;
  // Retain the historical sorting position while making the extraction metadata explicit.
  return stableJson(stockGate ? { ...publicSource, visibility: stockGate } : publicSource);
}

export function getSourceProvenance(
  source: object,
  validationFieldPath: string,
): SourceProvenance | undefined {
  const provenanceByTarget = provenanceBySource.get(source);
  if (!provenanceByTarget) return undefined;
  return [...provenanceByTarget.entries()]
    .filter(
      ([targetPath]) =>
        validationFieldPath === targetPath || validationFieldPath.startsWith(`${targetPath}.`),
    )
    .toSorted(([left], [right]) => right.length - left.length)[0]?.[1];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .toSorted((left, right) => compareStrings(left, right))
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
