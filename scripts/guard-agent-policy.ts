import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readGuardMessage } from "#scripts/guard-generated-reads";
import { contextOutput, readHookInput, shellCommand } from "#scripts/lib/agent-hook";
import { commandArgs, policySegments, programWords } from "#scripts/lib/agent-policy-shell";

import type { HookInput } from "#scripts/lib/agent-hook";

interface PolicyResult {
  context?: string;
  message?: string;
}

const AUDIT_CONTEXT =
  "Dependency change: before adding or bumping a dependency, read docs/agent-reference.md (Package commands), run pnpm audit --audit-level=moderate, and inspect every flagged transitive dependency with pnpm why. Do not add an unpatched advisory; a disputed advisory or one with no fix needs a documented auditConfig.ignoreGhsas exception in pnpm-workspace.yaml.";
const ATTRIBUTION = /(?:^|\r?\n)Agent: [a-z][a-z0-9-]*\s*$/;
function githubHelp(args: string[]): boolean {
  const rest = args.slice(2);
  // Exempt only bare help requests; mixed options need normal attribution validation.
  return (
    rest.some((arg) => arg === "--help" || arg === "-h") &&
    rest.every((arg) => arg === "--help" || arg === "-h" || !arg.startsWith("-"))
  );
}

function optionValue(args: string[], long: string, short: string): string | undefined {
  const index = args.findIndex(
    (arg) => arg === long || arg === short || arg.startsWith(`${long}=`),
  );
  if (index === -1) return undefined;
  return args[index].startsWith(`${long}=`)
    ? args[index].slice(long.length + 1)
    : (args[index + 1] ?? "");
}

function githubBody(
  args: string[],
  input: HookInput,
  heredoc: string,
  changesDirectory: boolean,
): string | undefined {
  const [kind, action] = args;
  if (!/^(?:issue|pr)$/.test(kind ?? "") || !/^(?:create|comment|edit)$/.test(action ?? "")) {
    return undefined;
  }
  if (githubHelp(args)) return undefined;
  const file = optionValue(args, "--body-file", "-F");
  const inline = optionValue(args, "--body", "-b");
  if (file === undefined && inline === undefined) {
    if (
      args.includes("--editor") ||
      args.includes("--web") ||
      args.includes("-e") ||
      args.includes("-w")
    ) {
      return "Use --body-file so the GitHub body’s attribution can be checked.";
    }
    // Label/assignee/title edits & comment deletion don't submit a body.
    return action === "edit" || args.includes("--delete-last")
      ? undefined
      : "Use --body-file with a body ending in an Agent: line.";
  }
  let body = inline;
  if (file !== undefined) {
    if (file === "-") {
      if (heredoc === "") {
        return "Cannot verify attribution from dynamic stdin. Use --body-file <path> or a quoted heredoc.";
      }
      body = heredoc;
    } else {
      if (/[$`]/.test(file)) {
        return "The GitHub body guard cannot expand shell variables or command substitutions. Use a literal path without $ or backticks for --body-file.";
      }
      if (changesDirectory && !isAbsolute(file)) {
        return "Use an absolute --body-file path when the command changes directory; relative body attribution can't be verified safely.";
      }
      const path = resolve(input.cwd ?? process.cwd(), file);
      const denied = readGuardMessage({
        ...input,
        tool_input: { file_path: path },
        tool_name: "Read",
      });
      if (denied) return denied;
      try {
        if (!statSync(path).isFile() || statSync(path).size > 1024 * 1024) {
          return "Use a regular body file smaller than 1 MiB.";
        }
        body = readFileSync(path, "utf8");
      } catch {
        return "Cannot read the GitHub body file. The guard reads paths literally, without shell expansion (including ~ and globs). Use an existing literal path for --body-file.";
      }
    }
  }
  if (file === undefined && /[\r\n]|\\[rn]/.test(body ?? "")) {
    return "Use --body-file for multiline GitHub bodies, with literal newlines.";
  }
  if (!ATTRIBUTION.test(body ?? "")) {
    return "The GitHub body must end with an Agent: <agent-id> line.";
  }
  return undefined;
}

function extractsAllAssets(words: string[]): boolean {
  const [program, ...args] = words;
  const archive = args.findIndex((arg) => /(?:^|[/\\])assets\.zip$/.test(arg));
  if (archive === -1) {
    return (
      /^(?:python[\d.]*|node)$/.test(program ?? "") &&
      args.join(" ").includes("assets.zip") &&
      /extractall|unpack_archive/.test(args.join(" "))
    );
  }
  if (program === "unzip") {
    if (args.some((arg) => /^-[^-]*[lZtvp]/.test(arg))) return false;
    const selectors: string[] = [];
    for (let index = archive + 1; index < args.length; index++) {
      if (args[index] === "-x") break;
      if (args[index] === "-d") {
        index++;
        continue;
      }
      if (!args[index].startsWith("-")) selectors.push(args[index]);
    }
    return (
      selectors.length === 0 ||
      selectors.some((arg) => /^(?:\.\/)?(?:\*|\*\*|\*\.\*|\.)\/?$/.test(arg))
    );
  }
  if (/^(?:bsd)?tar$/.test(program ?? "")) {
    if (!args.some((arg) => /^(?:-[^-]*)?x/.test(arg) || arg === "--extract")) return false;
    const selectors: string[] = [];
    for (let index = archive + 1; index < args.length; index++) {
      if (args[index] === "-C" || args[index] === "--directory") {
        index++;
        continue;
      }
      if (!args[index].startsWith("-")) selectors.push(args[index]);
    }
    return selectors.length === 0 || selectors.some((arg) => /^(?:\.\/)?[.*]+\/?$/.test(arg));
  }
  if (/^7z[ar]?$/.test(program ?? "")) {
    const selectors = args.slice(archive + 1).filter((arg) => !arg.startsWith("-"));
    return (
      /^[xe]$/.test(args[0] ?? "") &&
      (selectors.length === 0 || selectors.some((arg) => /^(?:\.\/)?[.*]+\/?$/.test(arg)))
    );
  }
  return /^python[\d.]*$/.test(program ?? "") && args.includes("zipfile") && args.includes("-e");
}

/** Shared PreToolUse policy: literal commands only; never execute a command to inspect it. */
export function policyResult(input: HookInput, env: NodeJS.ProcessEnv = process.env): PolicyResult {
  const command = shellCommand(input);
  if (command === undefined) return {};
  let context: string | undefined;
  const segments = policySegments(command);
  const changesDirectory = segments.some((segment) =>
    /^(?:cd|pushd|popd)$/.test(programWords(segment.command)[0] ?? ""),
  );
  for (const segment of segments) {
    const words = programWords(segment.command);
    const args = commandArgs(words);
    const assetWords = /^python[\d.]*$/.test(words[0] ?? "") ? [...words, segment.heredoc] : words;
    if (env.MISTRIA_ALLOW_FULL_ASSETS !== "1" && extractsAllAssets(assetWords)) {
      return {
        message:
          "Full extraction of assets.zip needs the user’s explicit approval. Read entries directly or extract a named subtree; the user can opt in with inherited MISTRIA_ALLOW_FULL_ASSETS=1.",
      };
    }
    if (words[0] === "git" && args[0] === "stash") {
      const operation = args[1]?.startsWith("-") ? "push" : args[1];
      const namedPush = operation === "push" && optionValue(args, "--message", "-m");
      if (
        operation === undefined ||
        operation === "pop" ||
        (operation === "push" && !namedPush) ||
        (operation === "apply" && !args.some((arg) => /^[a-f\d]{7,40}$/i.test(arg)))
      ) {
        return {
          message:
            "The stash stack is shared by all worktrees. Use git stash push -m <name>, or git stash apply <commit-sha>; never use bare git stash or git stash pop.",
        };
      }
    }
    if (words[0] === "gh") {
      const message = githubBody(args, input, segment.heredoc, changesDirectory);
      if (message) return { message };
    }
    if (words[0] === "pnpm" && /^(?:add|update|up|remove|rm|uninstall)$/.test(args[0] ?? "")) {
      context = AUDIT_CONTEXT;
    }
  }
  return context ? { context } : {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = policyResult(readHookInput());
  if (result.message) {
    console.error(result.message);
    process.exitCode = 2;
  } else if (result.context) {
    console.log(contextOutput("PreToolUse", result.context));
  }
}
