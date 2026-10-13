import { resolve } from "node:path";

export interface CliOptions {
  assetsDir?: string;
  parseOnly: boolean;
  parseProfile?: "v1.0.7";
  sprites: boolean;
  version?: string;
  villagerSpritesOnly: boolean;
}

/** Parses the pipeline's public CLI before reading game assets or writing outputs. */
export function parseCliOptions(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    parseOnly: false,
    sprites: false,
    villagerSpritesOnly: false,
  };
  const seen = new Set<string>();
  for (const arg of args) {
    if (arg === "--") continue;
    if (!arg.startsWith("-")) {
      if (options.assetsDir !== undefined) {
        throw new Error("Pass at most one assets directory.");
      }
      options.assetsDir = arg;
      continue;
    }
    const [name, value] = arg.split("=", 2);
    if (seen.has(name)) throw new Error(`Duplicate option: ${name}`);
    seen.add(name);
    switch (name) {
      case "--parse-only":
        if (value !== undefined) throw new Error(`Unknown option: ${arg}`);
        options.parseOnly = true;
        break;
      case "--parse-profile":
        if (value !== "v1.0.7") throw new Error(`Unknown parse profile: ${value ?? "(missing)"}`);
        options.parseProfile = value;
        break;
      case "--sprites":
        if (value !== undefined) throw new Error(`Unknown option: ${arg}`);
        options.sprites = true;
        break;
      case "--version":
        if (!value) throw new Error("Pass --version=X.Y.Z.");
        options.version = value;
        break;
      case "--villager-sprites-only":
        if (value !== undefined) throw new Error(`Unknown option: ${arg}`);
        options.villagerSpritesOnly = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.parseProfile && !options.parseOnly) {
    throw new Error("--parse-profile requires --parse-only.");
  }
  if (options.parseOnly && (options.sprites || options.villagerSpritesOnly)) {
    throw new Error("--parse-only cannot be combined with sprite extraction flags.");
  }
  if (options.sprites && options.villagerSpritesOnly) {
    throw new Error("Choose --sprites or --villager-sprites-only.");
  }
  return options;
}

/**
 * Resolves a user-supplied path against the directory the command was invoked from. The `pipeline`
 * script runs `cd pipeline` first, so the process cwd is not the caller's; pnpm records the
 * caller's directory in `INIT_CWD`.
 */
export function resolveCallerPath(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  return resolve(env.INIT_CWD ?? cwd, path);
}
