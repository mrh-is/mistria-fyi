import type { Source } from "#lib/types/acquisition.js";
import type { AnimalId, CosmeticId, ItemId, PetCosmeticSetId } from "#lib/types/tracker-data.js";

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

  append(targetId: TargetId, source: Source, provenance?: SourceProvenance): void {
    this.add(targetId, source, provenance);
  }

  entries(): [TargetId, Source[]][] {
    return [...this.#sourcesByTarget.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right))
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
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([, source]) => source);
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

export function canonicalSourceJson(source: Source): string {
  const { visibility: _visibility, ...identity } = source as Source & {
    visibility?: unknown;
  };
  return stableJson(identity);
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
      .toSorted((left, right) => left.localeCompare(right))
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
