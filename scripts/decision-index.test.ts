import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { decisionIndex, decisionSources, renderDecisionIndex } from "./decision-index.js";

const evidence = "https://github.com/owner/repo/pull/1";
function record(id: string, overrides: Record<string, unknown> = {}): string {
  return `---\n${stringify({
    evidence: [evidence],
    id,
    relationships: [],
    status: "current",
    summary: "The policy applies.",
    ...overrides,
  })}---\n\n# A decision\n\n## Context\n\nHistorical reasoning.\n`;
}
function relation(target: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "amended-by",
    evidence: [evidence],
    portion: "The old prompt only.",
    scope: "partial",
    target,
    ...overrides,
  };
}
const exists = (path: string) => path === "src/policy.ts";
const revisitSources = (revisit: unknown) => ({
  "a.md": record("a", { relationships: [relation("b", { revisit })], status: "amended" }),
  "b.md": record("b"),
});

describe("decision metadata validation", () => {
  it("covers every discovered record, including nested decisions without a header", () => {
    const root = mkdtempSync(join(tmpdir(), "decision-index-"));
    try {
      mkdirSync(join(root, "docs/decisions/nested"), { recursive: true });
      writeFileSync(join(root, "docs/decisions/a.md"), record("a"));
      writeFileSync(join(root, "docs/decisions/nested/omitted.md"), "# Omitted decision\n");
      const sources = decisionSources(root);
      expect(Object.keys(sources).toSorted()).toEqual([
        "docs/decisions/a.md",
        "docs/decisions/nested/omitted.md",
      ]);
      expect(() => decisionIndex(sources, exists)).toThrow("omitted.md: missing decision metadata");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects an empty directory & duplicate stable IDs", () => {
    expect(() => decisionIndex({}, exists)).toThrow("must contain records");
    expect(() => decisionIndex({ "a.md": record("a"), "b.md": record("a") }, exists)).toThrow(
      "duplicate decision ID a",
    );
  });

  it("rejects missing decision & local evidence targets", () => {
    expect(() =>
      decisionIndex(
        { "a.md": record("a", { relationships: [relation("missing")], status: "amended" }) },
        exists,
      ),
    ).toThrow("missing decision target missing");
    expect(() =>
      decisionIndex({ "a.md": record("a", { evidence: ["src/missing.ts"] }) }, exists),
    ).toThrow("missing or invalid evidence target");
    expect(
      decisionIndex({ "a.md": record("a", { evidence: ["src/policy.ts#rule"] }) }, exists),
    ).toHaveLength(1);
  });

  it.each([
    "../outside.md",
    "/outside.md",
    "src/../outside.md",
    String.raw`src\policy.ts`,
    "https://example.com/policy",
    "#638",
  ])("rejects invalid evidence %s", (target) => {
    expect(() => decisionIndex({ "a.md": record("a", { evidence: [target] }) }, exists)).toThrow(
      "invalid evidence",
    );
  });

  it("keeps a partial amendment distinct from whole-record supersession", () => {
    const records = decisionIndex(
      {
        "docs/decisions/new.md": record("new"),
        "docs/decisions/old.md": record("old", {
          relationships: [relation("new")],
          status: "amended",
        }),
      },
      exists,
    );
    expect(records.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "new", status: "current" },
      { id: "old", status: "amended" },
    ]);
    const text = renderDecisionIndex(records);
    expect(text).toContain("Status: Partially superseded/amended");
    expect(text).toContain("Affected portion: The old prompt only.");
    expect(text).toContain("(decisions/new.md)");
    expect(() =>
      decisionIndex(
        {
          "a.md": record("a", {
            relationships: [relation("b", { type: "superseded-by" })],
            status: "superseded",
          }),
          "b.md": record("b"),
        },
        exists,
      ),
    ).toThrow("requires full superseded-by");
  });

  it.each([
    { relationships: [relation("b")], status: "current" },
    { status: "amended" },
    { status: "superseded" },
    { relationships: [relation("b")], status: "retired" },
    { relationships: [relation("b", { scope: "all" })], status: "amended" },
  ])("rejects inconsistent status & relationships: %j", (overrides) => {
    expect(() =>
      decisionIndex({ "a.md": record("a", overrides), "b.md": record("b") }, exists),
    ).toThrow(/status\/relationship|requires partial/);
  });

  it("accepts a deliberate retirement & full supersession with evidence", () => {
    const records = decisionIndex(
      {
        "a.md": record("a", {
          relationships: [relation("b", { type: "superseded-by", scope: "all" })],
          status: "superseded",
        }),
        "b.md": record("b", {
          status: "retired",
          summary: "The owner retired the policy without replacement.",
        }),
      },
      exists,
    );
    expect(records.map(({ status }) => status)).toEqual(["superseded", "retired"]);
  });

  it("requires an explicit applicability question for unresolved decisions", () => {
    expect(() =>
      decisionIndex({ "a.md": record("a", { status: "needs-review" }) }, exists),
    ).toThrow("unresolved applicability question");
    const records = decisionIndex(
      {
        "a.md": record("a", {
          review: "Does the native table still omit this value?",
          status: "needs-review",
        }),
      },
      exists,
    );
    expect(renderDecisionIndex(records)).toContain(
      "Unresolved applicability: Does the native table still omit this value?",
    );
  });

  it("requires a complete revisit evidence & authorization trail", () => {
    expect(() =>
      decisionIndex(revisitSources({ condition: "Updates may reload.", evidence }), exists),
    ).toThrow(/Invalid/);
    expect(() =>
      decisionIndex(
        revisitSources({
          authorization: "src/missing.ts",
          condition: "Updates may reload.",
          evidence,
        }),
        exists,
      ),
    ).toThrow("invalid evidence");
    const records = decisionIndex(
      revisitSources({ authorization: evidence, condition: "Updates may reload.", evidence }),
      exists,
    );
    expect(renderDecisionIndex(records)).toContain("Authorization:");
  });

  it("rejects duplicate edges, self-links, & mixed amendment/supersession cycles", () => {
    expect(() =>
      decisionIndex(
        {
          "a.md": record("a", { relationships: [relation("a"), relation("a")], status: "amended" }),
        },
        exists,
      ),
    ).toThrow("duplicate relationship");
    expect(() =>
      decisionIndex(
        { "a.md": record("a", { relationships: [relation("a")], status: "amended" }) },
        exists,
      ),
    ).toThrow("cycle");
    expect(() =>
      decisionIndex(
        {
          "a.md": record("a", { relationships: [relation("b")], status: "amended" }),
          "b.md": record("b", {
            relationships: [relation("c", { type: "superseded-by", scope: "all" })],
            status: "superseded",
          }),
          "c.md": record("c", { relationships: [relation("a")], status: "amended" }),
        },
        exists,
      ),
    ).toThrow("cycle");
  });

  it("rejects malformed, unknown, & empty metadata instead of quietly omitting records", () => {
    for (const overrides of [
      { status: "unknown" },
      { id: "" },
      { summary: " " },
      { evidence: [] },
      { surprise: true },
      { relationships: [relation("a", { portion: "" })] },
    ]) {
      expect(() => decisionIndex({ "a.md": record("a", overrides) }, exists)).toThrow(/Invalid/);
    }
    expect(() =>
      decisionIndex({ "a.md": "---\nid: a\nid: b\n---\n# Duplicate YAML\n" }, exists),
    ).toThrow(/unique/);
  });
});

describe("decision index CLI", () => {
  it("fails the executable check for an omitted record & stale generated output", () => {
    const root = mkdtempSync(join(tmpdir(), "decision-cli-"));
    const script = join(import.meta.dirname, "decision-index.ts");
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
    try {
      mkdirSync(join(root, "docs/decisions"), { recursive: true });
      writeFileSync(join(root, "docs/decisions/a.md"), "# Missing header\n");
      expect(run("--check").status).toBe(1);
      expect(run("--check").stderr).toContain("missing decision metadata");
      writeFileSync(join(root, "docs/decisions/a.md"), record("a"));
      expect(run("--check").stderr).toContain("index is stale");
      expect(run("--write").status).toBe(0);
      expect(run("--check").status).toBe(0);
      writeFileSync(
        join(root, "docs/decisions/a.md"),
        record("a", { summary: "The policy changed." }),
      );
      const stale = run("--check");
      expect(stale.status).toBe(1);
      expect(stale.stderr).toContain("index is stale");
      expect(run("--write").status).toBe(0);
      const json = run("--json", "--status=current");
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout)).toMatchObject([
        { id: "a", path: "docs/decisions/a.md", status: "current" },
      ]);
      expect(JSON.parse(run("--json", "--status=retired").stdout)).toEqual([]);
      expect(run("--status=current").status).toBe(1);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
