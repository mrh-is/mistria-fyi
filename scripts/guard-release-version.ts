import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readGuardMessage } from "#scripts/guard-generated-reads";
import {
  canonicalPath,
  editPaths,
  readHookInput,
  shellCommand,
  shellWriteTargets,
} from "#scripts/lib/agent-hook";
import { commandArgs, policySegments, programWords } from "#scripts/lib/agent-policy-shell";

import type { HookInput } from "#scripts/lib/agent-hook";

const ADVICE =
  "Release metadata is guarded: package.json’s version & Git tags require an approved release. The user must approve the version and set inherited MISTRIA_RELEASE=1 for the release session.";

function packagePath(path: string): boolean {
  return basename(path.replaceAll("\\", "/")) === "package.json";
}

function version(text: string): unknown {
  return (JSON.parse(text) as { version?: unknown }).version;
}

function editText(before: string, edit: unknown): string | undefined {
  if (
    typeof edit !== "object" ||
    edit === null ||
    !("old_string" in edit) ||
    !("new_string" in edit)
  ) {
    return undefined;
  }
  if (
    typeof edit.old_string !== "string" ||
    typeof edit.new_string !== "string" ||
    !before.includes(edit.old_string)
  ) {
    return undefined;
  }
  return before.replaceAll(edit.old_string, edit.new_string);
}

function patchText(before: string, section: string): string {
  if (section.startsWith("*** Add File:")) {
    return section
      .split("\n")
      .filter((line) => line.startsWith("+"))
      .map((line) => line.slice(1))
      .join("\n");
  }
  const lines = before.split("\n");
  let oldLines: string[] = [];
  let newLines: string[] = [];
  let cursor = 0;
  const flush = () => {
    if (oldLines.length === 0 && newLines.length === 0) return;
    const matches = lines.flatMap((_, index) =>
      index >= cursor &&
      oldLines.length > 0 &&
      oldLines.every((line, offset) => lines[index + offset] === line)
        ? [index]
        : [],
    );
    if (matches.length !== 1) throw new Error("Cannot predict patch uniquely");
    lines.splice(matches[0], oldLines.length, ...newLines);
    cursor = matches[0] + newLines.length;
    oldLines = [];
    newLines = [];
  };
  for (const line of section.split("\n")) {
    if (line.startsWith("@@") || line.startsWith("***")) {
      flush();
    } else if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
    } else if (line.startsWith("+")) {
      newLines.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      oldLines.push(line.slice(1));
      newLines.push(line.slice(1));
    }
  }
  flush();
  return lines.join("\n");
}

function patchChangesVersion(patch: string, cwd: string): boolean {
  for (const section of patch.split(/(?=^\*\*\* (?:Add|Update|Delete) File: )/m)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/m.exec(section);
    const move = /^\*\*\* Move to: (.+)$/m.exec(section);
    if (
      !header ||
      (!packagePath(canonicalPath(cwd, header[2])) &&
        !(move && packagePath(canonicalPath(cwd, move[1]))))
    ) {
      continue;
    }
    if (header[1] === "Delete" || move) return true;
    const target = resolve(cwd, header[2]);
    if (readGuardMessage({ cwd, tool_input: { file_path: target }, tool_name: "Read" })) {
      return true;
    }
    try {
      const before = existsSync(target) ? readFileSync(target, "utf8") : "{}";
      if (version(before) !== version(patchText(before, section))) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** Predict file-tool edits; opaque shell writes require opt-in because their JSON can't be checked. */
export function releaseGuardMessage(
  input: HookInput,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.MISTRIA_RELEASE === "1") return undefined;
  const command = shellCommand(input);
  if (command !== undefined) {
    for (const segment of policySegments(command)) {
      const words = programWords(segment.command);
      const args = commandArgs(words);
      if (words[0] === "git" && args[0] === "tag") {
        const options = args.slice(1);
        const mutation = options.some(
          (arg) =>
            /^--(?:delete|annotate|sign|local-user|message|file|force)(?:=|$)/.test(arg) ||
            /^-[^-]*[dasumFf]/.test(arg),
        );
        const listing =
          options.length === 0 ||
          options.some(
            (arg) =>
              /^(?:--list|--verify|--contains|--no-contains|--points-at|--merged|--no-merged)(?:=|$)/.test(
                arg,
              ) || /^-[^-]*[lv]/.test(arg),
          );
        if (mutation || !listing) return ADVICE;
      }
      if (
        words[0] === "pnpm" &&
        (args[0] === "version" ||
          (args[0] === "pkg" &&
            /^(?:set|delete)$/.test(args[1] ?? "") &&
            args.slice(2).some((arg) => /^version(?:=|$)/.test(arg))))
      ) {
        return ADVICE;
      }
    }
    return shellWriteTargets(command).some((target) => packagePath(target)) ? ADVICE : undefined;
  }
  const cwd = input.cwd ?? process.cwd();
  const targets = editPaths(input).filter(
    (target) => packagePath(target) || packagePath(canonicalPath(cwd, target)),
  );
  if (targets.length === 0) return undefined;
  const tool = input.tool_input;
  let patch: unknown;
  if (typeof tool === "string") patch = tool;
  else if (input.tool_name === "apply_patch") patch = tool?.command;
  if (typeof patch === "string") return patchChangesVersion(patch, cwd) ? ADVICE : undefined;
  if (typeof tool !== "object" || tool === null) return ADVICE;
  for (const target of targets) {
    try {
      if (readGuardMessage({ cwd, tool_input: { file_path: target }, tool_name: "Read" })) {
        return ADVICE;
      }
      const before = readFileSync(resolve(input.cwd ?? process.cwd(), target), "utf8");
      let after: string | undefined;
      if (typeof tool.content === "string") {
        after = tool.content;
      } else if (Array.isArray(tool.edits)) {
        after = before;
        for (const edit of tool.edits) {
          after = editText(after, edit);
          if (after === undefined) break;
        }
      } else {
        after = editText(before, tool);
      }
      if (after === undefined || version(before) !== version(after)) return ADVICE;
    } catch {
      return ADVICE;
    }
  }
  return undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const message = releaseGuardMessage(readHookInput());
  if (message) {
    console.error(message);
    process.exitCode = 2;
  }
}
