import type { Source } from "$lib/types/acquisition.js";
import type { CosmeticId, ItemId } from "$lib/types/tracker-data.js";

export interface SourceProvenance {
  fieldPath: string;
  sourcePath: string;
}

const provenanceBySource = new WeakMap<object, Map<string, SourceProvenance>>();

abstract class SourceAccumulator<TargetId extends string> {
  readonly #sourcesByTarget = new Map<TargetId, Map<string, Source>>();

  protected constructor(private readonly targetNamespace: "cosmetics" | "items") {}

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
        provenanceByTarget.set(`${this.targetNamespace}.${targetId}`, provenance);
      }
    }
  }

  append(targetId: TargetId, source: Source, provenance?: SourceProvenance): void {
    this.add(targetId, source, provenance);
  }

  entries(): [TargetId, Source[]][] {
    return [...this.#sourcesByTarget.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([targetId, sources]) => [targetId, this.#sortedSources(sources)]);
  }

  get(targetId: TargetId): Source[] {
    return this.#sortedSources(this.#sourcesByTarget.get(targetId));
  }

  toRecord(): Record<TargetId, Source[]> {
    return Object.fromEntries(this.entries()) as Record<TargetId, Source[]>;
  }

  #sortedSources(sources: Map<string, Source> | undefined): Source[] {
    if (!sources) return [];
    return [...sources.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, source]) => source);
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
    .sort(([left], [right]) => right.length - left.length)[0]?.[1];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
