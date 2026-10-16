import { CURRENT_GAME_VERSION } from "../game-version.js";

export interface AtlasCliOptions {
  assetsDir?: string;
  compare?: string;
  outDir?: string;
  version: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;

/** Parses `pipeline:atlas` arguments before any game files are read. */
export function parseAtlasCliOptions(args: readonly string[]): AtlasCliOptions {
  let assetsDir: string | undefined;
  const values = new Map<string, string>();
  for (const arg of args) {
    if (arg === "--") continue;
    if (!arg.startsWith("-")) {
      if (assetsDir !== undefined) throw new Error("Pass at most one game-files directory.");
      assetsDir = arg;
      continue;
    }
    const [name, value] = arg.split("=", 2);
    if (!["--compare", "--out", "--version"].includes(name)) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (values.has(name)) throw new Error(`Duplicate option: ${name}`);
    if (!value) throw new Error(`Pass a value: ${name}=…`);
    values.set(name, value);
  }

  const version = parseVersion(values.get("--version"), "--version");
  if (version === undefined) throw new Error("Pass --version=X.Y.Z or --version=current.");
  const compare = parseVersion(values.get("--compare"), "--compare");
  if (compare === version) throw new Error("--compare must name a different version.");
  return { assetsDir, compare, outDir: values.get("--out"), version };
}

function parseVersion(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  const version = value === "current" ? CURRENT_GAME_VERSION : value.replace(/^v/, "");
  if (!VERSION.test(version)) throw new Error(`${name} must be X.Y.Z or current, not ${value}.`);
  return version;
}
