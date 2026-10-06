export interface PipelineDiagnostic {
  fieldPath: string;
  kind:
    | "biome-less-forageable"
    | "empty-almanac"
    | "letter-without-trigger"
    | "missing-target"
    | "mixed-recipe-default"
    | "obsolete-override"
    | "recipe-id-collision"
    | "unparseable-reached-date"
    | "unresolved-scroll-target";
  message: string;
  targetId: string;
}

export interface ReviewedPipelineDiagnostic extends PipelineDiagnostic {
  evidence: string;
  reason: string;
}

/** One run’s data-quality findings, checked before any staged output is published. */
export class PipelineDiagnostics {
  readonly #entries: PipelineDiagnostic[] = [];
  readonly #reviewed: ReadonlyMap<string, ReviewedPipelineDiagnostic>;

  constructor(reviewed: readonly ReviewedPipelineDiagnostic[] = []) {
    const entries = new Map<string, ReviewedPipelineDiagnostic>();
    for (const entry of reviewed) {
      if (entry.kind === "missing-target" || entry.kind === "obsolete-override") {
        throw new Error(`Diagnostic ${entry.kind} cannot be allowlisted`);
      }
      if (!entry.reason.trim() || !entry.evidence.trim()) {
        throw new Error("Reviewed diagnostics require both a reason and evidence");
      }
      const key = diagnosticKey(entry);
      if (entries.has(key)) throw new Error(`Duplicate reviewed diagnostic: ${key}`);
      entries.set(key, entry);
    }
    this.#reviewed = entries;
  }

  add(diagnostic: PipelineDiagnostic): void {
    this.#entries.push(diagnostic);
  }

  validate(): void {
    const seen = new Set(this.#entries.map(diagnosticKey));
    const unreviewed = this.#entries.filter((entry) => !this.#reviewed.has(diagnosticKey(entry)));
    const obsolete = [...this.#reviewed.keys()].filter((key) => !seen.has(key));
    if (unreviewed.length > 0 || obsolete.length > 0) {
      throw new Error(
        [
          "Pipeline diagnostics failed:",
          ...unreviewed.map(
            (entry) =>
              `  ${entry.kind} at ${entry.fieldPath} (${entry.targetId}): ${entry.message}`,
          ),
          ...obsolete.map((key) => `  Obsolete reviewed diagnostic: ${key}`),
        ].join("\n"),
      );
    }
  }
}

function diagnosticKey(entry: PipelineDiagnostic): string {
  return JSON.stringify([entry.kind, entry.fieldPath, entry.targetId, entry.message]);
}
