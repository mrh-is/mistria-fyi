// Reads & writes an issue's status, type, & custom fields (Agent, Area, ...) through `gh api graphql`.
// `gh issue edit` can't set these yet. Delete this script once it can.
import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

interface Option {
  id: string;
  name: string;
}

export interface Catalog {
  fields: { id: string; name: string; options: Option[] }[];
  statuses: Option[];
  types: Option[];
}

interface CatalogResponse {
  repository: {
    issueFields: { nodes: { id?: string; name?: string; options?: Option[] }[] };
    issueTypes: { nodes: Option[] };
    planningStatuses: { nodes: Option[] };
  };
}

interface ShowResponse {
  repository: {
    issue: {
      issueFieldValues: { nodes: { field?: { name: string }; name: string }[] };
      issueType: null | { name: string };
      status: null | { name: string };
    };
  };
}

export type Update =
  | { fieldId: string; kind: "field"; optionId: null | string }
  | { kind: "status"; statusId: string }
  | { kind: "type"; typeId: null | string };

const USAGE =
  "Usage: issue-fields get <number> | set <number> <name=value>... | claim <number> <agent> | release <number>\n" +
  "Names: status, type, or a field such as agent or area. Use name=- to clear a type or field.";

function find(options: Option[], wanted: string, label: string): Option {
  const match = options.find((option) => option.name.toLowerCase() === wanted.toLowerCase());
  if (!match) {
    throw new Error(
      `Unknown ${label} "${wanted}". Choose one of: ${options.map((o) => o.name).join(", ")}.`,
    );
  }
  return match;
}

/** Turns `name=value` pairs into mutations, resolving every name against the catalog. */
export function resolveUpdates(assignments: string[], catalog: Catalog): Update[] {
  return assignments.map((assignment) => {
    const [name = "", ...rest] = assignment.split("=");
    const value = rest.join("=");
    if (!name || rest.length === 0 || !value) {
      throw new Error(`Expected name=value, got "${assignment}".`);
    }
    const key = name.toLowerCase();
    if (key === "status") {
      if (value === "-") {
        throw new Error("A status can't be cleared; set another one.");
      }
      return { kind: "status", statusId: find(catalog.statuses, value, "status").id };
    }
    if (key === "type") {
      return { kind: "type", typeId: value === "-" ? null : find(catalog.types, value, "type").id };
    }
    const field = catalog.fields.find((candidate) => candidate.name.toLowerCase() === key);
    if (!field) {
      const known = ["status", "type", ...catalog.fields.map((candidate) => candidate.name)];
      throw new Error(`Unknown name "${name}". Choose one of: ${known.join(", ")}.`);
    }
    return {
      fieldId: field.id,
      kind: "field",
      optionId: value === "-" ? null : find(field.options, value, field.name).id,
    };
  });
}

function graphql(query: string, variables: Record<string, string> = {}): unknown {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    // -F (not -f) so numeric values reach GraphQL as Int.
    args.push("-F", `${key}=${value}`);
  }
  const output = execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return (JSON.parse(output) as { data: unknown }).data;
}

function repository(): { name: string; owner: string } {
  const slug = execFileSync(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    {
      encoding: "utf8",
    },
  ).trim();
  const [owner = "", name = ""] = slug.split("/");
  return { name, owner };
}

function loadCatalog(repo: { name: string; owner: string }): Catalog {
  const { repository: data } = graphql(
    `
      query ($o: String!, $n: String!) {
        repository(owner: $o, name: $n) {
          planningStatuses(first: 20) {
            nodes {
              id
              name
            }
          }
          issueTypes(first: 25) {
            nodes {
              id
              name
            }
          }
          issueFields(first: 25) {
            nodes {
              __typename
              ... on IssueFieldSingleSelect {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { n: repo.name, o: repo.owner },
  ) as CatalogResponse;
  return {
    fields: data.issueFields.nodes.flatMap((node) =>
      node.id && node.name && node.options
        ? [{ id: node.id, name: node.name, options: node.options }]
        : [],
    ),
    statuses: data.planningStatuses.nodes,
    types: data.issueTypes.nodes,
  };
}

function issueId(repo: { name: string; owner: string }, number: string): string {
  const data = graphql(
    "query($o:String!,$n:String!,$i:Int!){repository(owner:$o,name:$n){issue(number:$i){id}}}",
    { i: number, n: repo.name, o: repo.owner },
  ) as { repository: { issue: { id: string } } };
  return data.repository.issue.id;
}

function apply(id: string, updates: Update[]): void {
  const fields = updates.filter((update) => update.kind === "field");
  for (const update of updates) {
    if (update.kind === "status") {
      graphql(
        "mutation($i:ID!,$s:ID!){setIssueStatus(input:{issueId:$i,statusId:$s}){clientMutationId}}",
        { i: id, s: update.statusId },
      );
    } else if (update.kind === "type") {
      graphql(
        update.typeId
          ? "mutation($i:ID!,$t:ID){updateIssueIssueType(input:{issueId:$i,issueTypeId:$t}){clientMutationId}}"
          : "mutation($i:ID!){updateIssueIssueType(input:{issueId:$i,issueTypeId:null}){clientMutationId}}",
        update.typeId ? { i: id, t: update.typeId } : { i: id },
      );
    }
  }
  if (fields.length > 0) {
    const entries = fields
      .map((field) =>
        field.optionId
          ? `{fieldId:"${field.fieldId}",singleSelectOptionId:"${field.optionId}"}`
          : `{fieldId:"${field.fieldId}",delete:true}`,
      )
      .join(",");
    graphql(
      `mutation($i:ID!){setIssueFieldValue(input:{issueId:$i,issueFields:[${entries}]}){clientMutationId}}`,
      { i: id },
    );
  }
}

export interface IssueState {
  fields: Record<string, string>;
  status: null | string;
  type: null | string;
}

export function readIssue(number: string): IssueState {
  const repo = repository();
  const {
    repository: { issue },
  } = graphql(
    `
      query ($o: String!, $n: String!, $i: Int!) {
        repository(owner: $o, name: $n) {
          issue(number: $i) {
            status {
              name
            }
            issueType {
              name
            }
            issueFieldValues(first: 20) {
              nodes {
                ... on IssueFieldSingleSelectValue {
                  name
                  field {
                    ... on IssueFieldSingleSelect {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    { i: number, n: repo.name, o: repo.owner },
  ) as ShowResponse;
  const values = issue.issueFieldValues.nodes.filter((node) => node.field);
  return {
    type: issue.issueType?.name ?? null,
    fields: Object.fromEntries(values.map((node) => [node.field?.name ?? "", node.name])),
    status: issue.status?.name ?? null,
  };
}

/** Throws when a name or value in `assignments` doesn't exist, without changing anything. */
export function checkAssignments(assignments: string[]): void {
  resolveUpdates(assignments, loadCatalog(repository()));
}

export function updateIssue(number: string, assignments: string[]): void {
  const repo = repository();
  const updates = resolveUpdates(assignments, loadCatalog(repo));
  apply(issueId(repo, number), updates);
}

export function issueFields(args: string[]): void {
  const [command, number = "", ...rest] = args;
  if (!/^[1-9]\d*$/.test(number) || !["claim", "get", "release", "set"].includes(command ?? "")) {
    throw new Error(USAGE);
  }
  if (command === "get") {
    console.log(JSON.stringify(readIssue(number), null, 2));
    return;
  }
  let assignments = rest;
  if (command === "claim") {
    const [agent, ...extra] = rest;
    if (!agent || extra.length > 0) {
      throw new Error(USAGE);
    }
    assignments = ["status=In progress", `agent=${agent}`];
  } else if (command === "release") {
    assignments = ["status=Todo", "agent=-"];
  }
  if (assignments.length === 0) {
    throw new Error(USAGE);
  }
  updateIssue(number, assignments);
  console.log(JSON.stringify(readIssue(number), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    issueFields(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
