// Shared uploader for the R2 bucket behind assets.mistria.fyi (sprites & locale fonts). A Node
// module rather than Bash so the upload scripts run the same on Windows, where `bash` from
// `cmd.exe` can resolve to WSL (#727).
//
// Env read by `r2UploadOptionsFromEnv`: R2_BUCKET, ASSET_ORIGIN, PARALLEL, FORCE=1 (re-upload
// everything), DRY_RUN=1 (print what would be uploaded without running Wrangler), & whether
// R2_UPLOAD_TOKEN is set (a real upload refuses to start without it). The upload scripts first fill
// R2_UPLOAD_TOKEN & CLOUDFLARE_ACCOUNT_ID from `.env.r2-upload` (see `loadR2UploadEnvFile`).
// Wrangler itself gets R2_UPLOAD_TOKEN as its CLOUDFLARE_API_TOKEN (see `wranglerEnv`).
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseEnv } from "node:util";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

/** Production asset origin; `src/lib/asset-origin.test.ts` keeps it in step with the app's. */
export const DEFAULT_ASSET_ORIGIN = "https://assets.mistria.fyi";
export const DEFAULT_BUCKET = "mistria-fyi-assets";
/** Right for versioned keys (locale fonts); keys overwritten in place pass a revalidating one. */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** How an upload decides a remote object is already current. */
export type SkipMode =
  /** The public object's ETag equals the local file's MD5 (keys overwritten in place). */
  | "etag"
  /** The public object exists (keys that never change once uploaded). */
  | "exists";

export interface R2UploadOptions {
  bucket: string;
  dryRun: boolean;
  force: boolean;
  /** Whether `R2_UPLOAD_TOKEN` is set; never its value. */
  hasUploadToken: boolean;
  origin: string;
  parallel: number;
}

export interface R2UploadTree {
  cacheControl?: string;
  contentType: string;
  /** Directory whose files are uploaded, keyed by their path relative to it. */
  dir: string;
  /** File extension to upload, such as `.webp`. */
  extension: string;
  keyPrefix: string;
  skipMode: SkipMode;
}

/** The result of one `wrangler r2 object put`. */
export interface WranglerResult {
  ok: boolean;
  output: string;
}

/** Side effects, injectable for tests. */
export interface R2UploadIo {
  fetch: typeof fetch;
  log: (line: string) => void;
  logError: (line: string) => void;
  putObject: (args: string[]) => Promise<WranglerResult>;
  retryDelay: (attempt: number) => Promise<void>;
}

export function r2UploadOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): R2UploadOptions {
  const parallel = Number(env.PARALLEL ?? "8");
  return {
    bucket: env.R2_BUCKET ?? DEFAULT_BUCKET,
    dryRun: env.DRY_RUN === "1",
    force: env.FORCE === "1",
    hasUploadToken: Boolean(env.R2_UPLOAD_TOKEN),
    origin: env.ASSET_ORIGIN ?? DEFAULT_ASSET_ORIGIN,
    parallel: Number.isInteger(parallel) && parallel > 0 ? parallel : 8,
  };
}

/** Lists every file under `dir`, as sorted `/`-separated paths relative to it. */
export async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    )
    .toSorted();
}

/** The repository root, so `pnpm exec` finds the workspace's Wrangler from any working directory. */
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * The gitignored file holding the upload credentials, at the checkout root. `.worktreeinclude`
 * links it into every worktree; Wrangler never loads it itself (it reads only `.env` &
 * `.env.local`).
 */
export const R2_UPLOAD_ENV_FILE = ".env.r2-upload";

/**
 * Fills `R2_UPLOAD_TOKEN` & `CLOUDFLARE_ACCOUNT_ID` in `env` from `.env.r2-upload`, when the file
 * exists. A nonempty value already in `env` wins, so a shell can override the file. Other names in
 * the file are ignored, so it can't replace `CLOUDFLARE_API_TOKEN`.
 */
export async function loadR2UploadEnvFile(
  env: NodeJS.ProcessEnv = process.env,
  file: string = path.join(REPO_ROOT, R2_UPLOAD_ENV_FILE),
): Promise<void> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  const values = parseEnv(text);
  for (const name of ["R2_UPLOAD_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    const value = values[name];
    if (!env[name] && value) {
      env[name] = value;
    }
  }
}

/**
 * Wrangler's environment: `R2_UPLOAD_TOKEN` becomes its `CLOUDFLARE_API_TOKEN`, for this child
 * only. A separate name keeps the R2 token from replacing the read-only Pages token that
 * `cloudflare:logs` & cloud agents hold in `CLOUDFLARE_API_TOKEN` (docs/cloud-agent-environments.md).
 * Wrangler also loads `.env` & `.env.local` from the repository root, but a nonempty process value
 * wins over them, so the token set here always reaches it. Without `R2_UPLOAD_TOKEN`, the inherited
 * token is dropped, and `r2UploadTree` refuses to upload, so no upload reaches Wrangler without the
 * token. A `.env` that defines `CLOUDFLARE_API_TOKEN` would still apply to a direct call then; an
 * empty value can't block it, because Wrangler's `.env` loader treats an empty process value as
 * unset.
 */
export function wranglerEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { CLOUDFLARE_API_TOKEN: _inherited, ...rest } = env;
  return env.R2_UPLOAD_TOKEN ? { ...rest, CLOUDFLARE_API_TOKEN: env.R2_UPLOAD_TOKEN } : rest;
}

/**
 * Runs the workspace's own Wrangler (installed for `@sveltejs/adapter-cloudflare`, whose native
 * deps `allowBuilds` in pnpm-workspace.yaml already approves) through pnpm's own executable, so no
 * shell shim is involved. `pnpx` would install a separate copy that ignores that approval.
 */
export function runWrangler(args: string[]): Promise<WranglerResult> {
  const pnpm = pnpmCommand(["exec", "wrangler", ...args]);
  return new Promise((resolve) => {
    const child = spawn(pnpm.command, pnpm.args, {
      cwd: REPO_ROOT,
      env: wranglerEnv(),
      shell: pnpm.shell,
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (error) => {
      resolve({ ok: false, output: `${output}${error.message}` });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output });
    });
  });
}

const defaultIo: R2UploadIo = {
  fetch: (input, init) => fetch(input, init),
  log: (line) => {
    console.log(line);
  },
  logError: (line) => {
    console.error(line);
  },
  putObject: runWrangler,
  retryDelay: (attempt) => sleep(attempt * 1000),
};

/** How long one HEAD check may take before it counts as unreachable. */
const CHECK_TIMEOUT_MS = 30_000;

/**
 * How a local file compares with the public object: `current` (nothing to upload), `changed` (the
 * object exists but its ETag differs), `missing` (no such object), or `unreachable` (the check
 * itself failed, so the answer is unknown).
 */
export type RemoteStatus = "changed" | "current" | "missing" | "unreachable";

async function remoteStatus(
  url: string,
  file: string,
  skipMode: SkipMode,
  io: R2UploadIo,
): Promise<RemoteStatus> {
  let response: Response;
  try {
    // A unique query string misses the edge cache, which can hold a superseded copy of the bare URL
    // (one uploaded with the year-long immutable policy stays stale there long after a re-upload).
    response = await io.fetch(`${url}?check=${randomUUID()}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch {
    return "unreachable";
  }
  // Only a 404 proves the object is absent; a 403, 429, or 5xx says nothing about it.
  if (response.status === 404) return "missing";
  if (!response.ok) return "unreachable";
  if (skipMode === "exists") return "current";
  const etag = response.headers.get("etag")?.replaceAll('"', "");
  if (!etag) return "unreachable";
  const md5 = createHash("md5")
    .update(await readFile(file))
    .digest("hex");
  return etag === md5 ? "current" : "changed";
}

/** An unreachable check counts as not current, so an upload still happens. */
async function isCurrent(
  url: string,
  file: string,
  skipMode: SkipMode,
  io: R2UploadIo,
): Promise<boolean> {
  return (await remoteStatus(url, file, skipMode, io)) === "current";
}

/** Runs `task` on each of `files`, at most `parallel` at a time. */
async function forEachPooled(
  files: readonly string[],
  parallel: number,
  task: (file: string) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const file = files[next];
      next += 1;
      // oxlint-disable-next-line eslint/no-await-in-loop -- each worker handles one file at a time; the pool bounds concurrency
      await task(file);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, files.length) }, worker));
}

/** A file whose public object is absent, differs, or could not be checked. */
export interface PendingUpload {
  key: string;
  status: Exclude<RemoteStatus, "current">;
}

/**
 * What an upload of `tree` would send, without sending it: every file whose public object is not
 * current, in sorted key order. The same check `r2UploadTree` makes before each put, so a dry run &
 * this agree.
 */
export async function findPendingUploads(
  tree: R2UploadTree,
  options: R2UploadOptions,
  io: R2UploadIo = defaultIo,
): Promise<PendingUpload[]> {
  const allFiles = await listFiles(tree.dir);
  const files = allFiles.filter((file) => file.endsWith(tree.extension));
  const pending: PendingUpload[] = [];
  await forEachPooled(files, options.parallel, async (file) => {
    const key = `${tree.keyPrefix}${file}`;
    const status = await remoteStatus(
      `${options.origin}/${key}`,
      path.join(tree.dir, file),
      tree.skipMode,
      io,
    );
    if (status !== "current") pending.push({ key, status });
  });
  return pending.toSorted((a, b) => {
    if (a.key < b.key) return -1;
    return a.key > b.key ? 1 : 0;
  });
}

async function uploadOne(
  relativePath: string,
  tree: R2UploadTree,
  options: R2UploadOptions,
  io: R2UploadIo,
): Promise<boolean> {
  const key = `${tree.keyPrefix}${relativePath}`;
  const file = path.join(tree.dir, relativePath);
  if (!options.force && (await isCurrent(`${options.origin}/${key}`, file, tree.skipMode, io))) {
    io.log(`skip ${key}`);
    return true;
  }
  if (options.dryRun) {
    io.log(`would put ${key}`);
    return true;
  }
  const args = [
    "r2",
    "object",
    "put",
    `${options.bucket}/${key}`,
    "--remote",
    "--file",
    file,
    "--content-type",
    tree.contentType,
    "--cache-control",
    tree.cacheControl ?? IMMUTABLE_CACHE_CONTROL,
  ];
  // Wrangler occasionally fails with a transient "fetch failed"; retry before giving up.
  let result: WranglerResult = { ok: false, output: "" };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each retry waits for the previous attempt
    result = await io.putObject(args);
    if (result.ok) {
      io.log(`put  ${key}`);
      return true;
    }
    if (attempt < 3) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- back off between sequential retries
      await io.retryDelay(attempt);
    }
  }
  io.logError(`FAILED ${key}`);
  for (const line of result.output.trimEnd().split(/\r?\n/)) {
    io.logError(`  wrangler: ${line}`);
  }
  return false;
}

/**
 * Uploads every `tree.extension` file under `tree.dir`, keyed as `keyPrefix` + its relative path,
 * up to `options.parallel` at a time. Resolves to whether every upload succeeded; a real upload
 * without `R2_UPLOAD_TOKEN` fails before checking or putting anything.
 */
export async function r2UploadTree(
  tree: R2UploadTree,
  options: R2UploadOptions,
  io: R2UploadIo = defaultIo,
): Promise<boolean> {
  // Without the token, Wrangler would fall back to an account-wide stored login (#115).
  if (!options.dryRun && !options.hasUploadToken) {
    io.logError(
      "R2_UPLOAD_TOKEN is not set in the environment or .env.r2-upload; uploads never fall back to wrangler login. Set it up per docs/machine-setup.md (R2 upload token), or preview with DRY_RUN=1.",
    );
    return false;
  }
  const allFiles = await listFiles(tree.dir);
  const files = allFiles.filter((file) => file.endsWith(tree.extension));
  let failed = 0;
  await forEachPooled(files, options.parallel, async (file) => {
    if (!(await uploadOne(file, tree, options, io))) failed += 1;
  });
  if (failed > 0) {
    io.logError("Some uploads failed; rerun to retry them.");
    return false;
  }
  io.log(`Done: ${files.length} objects staged for ${options.bucket}`);
  return true;
}
