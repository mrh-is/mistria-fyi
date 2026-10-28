import "#scripts/lib/require-pinned-node";

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as v from "valibot";
import { parse } from "yaml";

const nonempty = v.pipe(v.string(), v.trim(), v.nonEmpty());
const relationshipSchema = v.strictObject({
  type: v.picklist(["amended-by", "superseded-by"]),
  evidence: v.pipe(v.array(nonempty), v.minLength(1)),
  portion: nonempty,
  revisit: v.optional(
    v.strictObject({ authorization: nonempty, condition: nonempty, evidence: nonempty }),
  ),
  scope: v.picklist(["all", "partial"]),
  target: nonempty,
});
const metadataSchema = v.strictObject({
  evidence: v.pipe(v.array(nonempty), v.minLength(1)),
  id: v.pipe(nonempty, v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  relationships: v.array(relationshipSchema),
  review: v.optional(nonempty),
  status: v.picklist(["current", "amended", "superseded", "retired", "needs-review"]),
  summary: nonempty,
});

type Metadata = v.InferOutput<typeof metadataSchema>;
interface Decision extends Metadata {
  path: string;
  title: string;
}

const STATUS_LABELS = {
  amended: "Partially superseded/amended",
  current: "Current",
  "needs-review": "Needs review",
  retired: "Deliberately retired",
  superseded: "Superseded",
} satisfies Record<Metadata["status"], string>;

/** All Markdown records, including newly added or nested records without metadata. */
export function decisionSources(root: string): Record<string, string> {
  const sources: Record<string, string> = {};
  function visit(directory: string): void {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.name.endsWith(".md")) {
        sources[path] = readFileSync(join(root, path), "utf8");
      }
    }
  }
  visit("docs/decisions");
  return sources;
}

/** Parse every record before validating links, so an omitted header cannot escape coverage. */
export function decisionIndex(
  sources: Record<string, string>,
  targetExists: (path: string) => boolean,
): Decision[] {
  const records: Decision[] = [];
  const ids = new Set<string>();
  for (const [path, source] of Object.entries(sources).toSorted(([a], [b]) =>
    a < b ? -1 : Number(a !== b),
  )) {
    const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n\s*# ([^\r\n]+)/.exec(source);
    if (!header) {
      throw new Error(`${path}: missing decision metadata or title`);
    }
    const metadata = v.parse(metadataSchema, parse(header[1]));
    if (ids.has(metadata.id)) {
      throw new Error(`${path}: duplicate decision ID ${metadata.id}`);
    }
    ids.add(metadata.id);
    records.push({ ...metadata, path, title: header[2] });
  }
  if (records.length === 0) {
    throw new Error("Decision directory must contain records");
  }
  const byId = new Map(records.map((record) => [record.id, record]));
  function checkEvidence(reference: string, path: string): void {
    if (
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull|commit|blob)\/[^\s]+$/.test(reference)
    ) {
      return;
    }
    const file = reference.split("#")[0];
    if (
      !file ||
      posix.isAbsolute(file) ||
      posix.normalize(file) !== file ||
      file.startsWith("../") ||
      file.includes("\\") ||
      !targetExists(file)
    ) {
      throw new Error(`${path}: missing or invalid evidence target ${reference}`);
    }
  }
  for (const record of records) {
    const { relationships, status } = record;
    if ((status === "amended" || status === "superseded") !== relationships.length > 0) {
      throw new Error(`${record.path}: status/relationship mismatch`);
    }
    if (
      status === "superseded" &&
      !relationships.some((link) => link.type === "superseded-by" && link.scope === "all")
    ) {
      throw new Error(`${record.path}: superseded status requires full superseded-by`);
    }
    if (status === "amended" && relationships.some((link) => link.scope === "all")) {
      throw new Error(`${record.path}: amended status requires partial relationships`);
    }
    if (status === "needs-review" && !record.review) {
      throw new Error(`${record.path}: needs-review requires an unresolved applicability question`);
    }
    for (const evidence of record.evidence) {
      checkEvidence(evidence, record.path);
    }
    const seen = new Set<string>();
    for (const link of relationships) {
      if (!byId.has(link.target)) {
        throw new Error(`${record.path}: missing decision target ${link.target}`);
      }
      if (seen.has(link.target)) {
        throw new Error(`${record.path}: duplicate relationship target ${link.target}`);
      }
      seen.add(link.target);
      for (const evidence of link.evidence) {
        checkEvidence(evidence, record.path);
      }
      if (link.revisit) {
        checkEvidence(link.revisit.evidence, record.path);
        checkEvidence(link.revisit.authorization, record.path);
      }
    }
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(id: string): void {
    if (active.has(id)) {
      throw new Error(`Decision supersession/amendment cycle at ${id}`);
    }
    if (visited.has(id)) {
      return;
    }
    active.add(id);
    for (const link of byId.get(id)?.relationships ?? []) {
      visit(link.target);
    }
    active.delete(id);
    visited.add(id);
  }
  for (const record of records) {
    visit(record.id);
  }
  return records;
}

function evidenceLink(reference: string): string {
  return `[${reference}](${reference.startsWith("https:") ? reference : `../${reference}`})`;
}

/** A deterministic, readable projection; headers remain the only metadata inventory. */
export function renderDecisionIndex(records: Decision[]): string {
  const byId = new Map(records.map((record) => [record.id, record]));
  const lines = [
    "# Decision index",
    "",
    "<!-- Generated by pnpm run decisions -- --write. Edit each decision’s YAML header instead. -->",
    "",
    "Status describes applicability, not permission to reverse a decision. A satisfied revisit condition needs separate owner authorization. Local evidence paths are checked; remote evidence links are recorded without a network availability check.",
    "",
    "Query the headers with `pnpm run decisions -- --json`, optionally adding `--status=needs-review`. Regenerate this page with `pnpm run decisions -- --write`; `pnpm run lint` checks coverage, metadata, links, cycles, & freshness. See [the metadata guide](decision-metadata.md) for the schema & status meanings.",
    "",
  ];
  for (const status of ["current", "amended", "superseded", "retired", "needs-review"] as const) {
    const group = records.filter((record) => record.status === status);
    lines.push(`## ${STATUS_LABELS[status]}`, "");
    if (group.length === 0) {
      lines.push("No records have this status.", "");
    }
    for (const record of group) {
      lines.push(
        `### [${record.title}](${posix.relative("docs", record.path)})`,
        "",
        `ID: ${record.id}. Status: ${STATUS_LABELS[status]}.`,
        "",
        record.summary,
        "",
        `Evidence: ${record.evidence.map(evidenceLink).join(", ")}.`,
        "",
      );
      for (const link of record.relationships) {
        const target = byId.get(link.target);
        if (!target) {
          throw new Error(`Missing decision target ${link.target}`);
        }
        lines.push(
          `${link.type === "amended-by" ? "Amended" : "Superseded"} by [${target.title}](${posix.relative("docs", target.path)}). Affected portion: ${link.portion}`,
          "",
          `Relationship evidence: ${link.evidence.map(evidenceLink).join(", ")}.`,
          "",
        );
        if (link.revisit) {
          lines.push(
            `Revisit condition: ${link.revisit.condition} Evidence: ${evidenceLink(link.revisit.evidence)}. Authorization: ${evidenceLink(link.revisit.authorization)}.`,
            "",
          );
        }
      }
      if (record.review) {
        lines.push(`Unresolved applicability: ${record.review}`, "");
      }
    }
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== "--");
    const status = args.find((arg) => arg.startsWith("--status="))?.slice("--status=".length);
    if (
      args.some(
        (arg) => !["--check", "--write", "--json"].includes(arg) && !arg.startsWith("--status="),
      ) ||
      (status !== undefined && !Object.hasOwn(STATUS_LABELS, status)) ||
      (status !== undefined && !args.includes("--json")) ||
      args.filter((arg) => ["--check", "--write", "--json"].includes(arg)).length > 1
    ) {
      throw new Error("Usage: decision-index.ts [--check | --write | --json [--status=<status>]]");
    }
    const root = process.cwd();
    const records = decisionIndex(decisionSources(root), (path) => existsSync(resolve(root, path)));
    const output = join(root, "docs/decision-index.md");
    if (args.includes("--json")) {
      console.log(
        JSON.stringify(
          records.filter((record) => status === undefined || record.status === status),
          null,
          2,
        ),
      );
    } else if (args.includes("--write")) {
      writeFileSync(output, renderDecisionIndex(records));
    } else if (
      !existsSync(output) ||
      readFileSync(output, "utf8").replaceAll(/\s+/g, " ").trim() !==
        renderDecisionIndex(records).replaceAll(/\s+/g, " ").trim()
    ) {
      throw new Error("Decision index is stale; run pnpm run decisions -- --write");
    } else {
      console.log(`Decision index: ${records.length} records validated`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
