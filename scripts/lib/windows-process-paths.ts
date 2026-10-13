import { win32 } from "node:path";

/** Absolute executable & argument paths conservatively protect Windows worktrees from removal. */
export function windowsProcessPaths(output: string): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(output);
    const records: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const paths: string[] = [];
    for (const record of records) {
      if (typeof record !== "object" || record === null) return undefined;
      const { CommandLine: command, ExecutablePath: executable } = record as Record<
        string,
        unknown
      >;
      if (executable !== null && executable !== undefined && typeof executable !== "string") {
        return undefined;
      }
      if (command !== null && command !== undefined && typeof command !== "string") {
        return undefined;
      }
      if (typeof executable === "string" && win32.isAbsolute(executable)) paths.push(executable);
      if (typeof command === "string") {
        for (const match of command.matchAll(/(?:[^\s"=]+=)?(?:"([^"]*)"|([^\s"]+))/gu)) {
          const argument = match[1] ?? match[2] ?? "";
          if (win32.isAbsolute(argument)) paths.push(argument);
        }
      }
    }
    return paths;
  } catch {
    return undefined;
  }
}
