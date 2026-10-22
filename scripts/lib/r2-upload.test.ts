import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findPendingUploads,
  IMMUTABLE_CACHE_CONTROL,
  listFiles,
  r2UploadOptionsFromEnv,
  r2UploadTree,
  wranglerEnv,
} from "#scripts/lib/r2-upload";

import type {
  R2UploadIo,
  R2UploadOptions,
  R2UploadTree,
  WranglerResult,
} from "#scripts/lib/r2-upload";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

/** A temporary tree of files, keyed by `/`-separated relative path. */
function tree(files: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), "mistria-r2-upload-"));
  directories.push(directory);
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), contents);
  }
  return directory;
}

function md5(contents: string): string {
  return createHash("md5").update(contents).digest("hex");
}

interface FakeIo extends R2UploadIo {
  errors: string[];
  lines: string[];
  puts: string[][];
}

/**
 * Remote objects by bare URL (any query string ignored), as HEAD responses; Wrangler results are
 * consumed in order.
 */
function fakeIo(remote: Record<string, Response> = {}, results: WranglerResult[] = []): FakeIo {
  const io: FakeIo = {
    errors: [],
    fetch: (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(
        remote[`${url.origin}${url.pathname}`]?.clone() ?? new Response(null, { status: 404 }),
      );
    },
    lines: [],
    log: (line) => io.lines.push(line),
    logError: (line) => io.errors.push(line),
    putObject: (args) => {
      io.puts.push(args);
      return Promise.resolve(results.shift() ?? { ok: true, output: "" });
    },
    puts: [],
    retryDelay: () => Promise.resolve(),
  };
  return io;
}

const options: R2UploadOptions = {
  bucket: "bucket",
  dryRun: false,
  force: false,
  origin: "https://assets.example",
  parallel: 2,
};

function sprites(dir: string): R2UploadTree {
  return {
    cacheControl: "public, max-age=86400",
    contentType: "image/webp",
    dir,
    extension: ".webp",
    keyPrefix: "sprites/",
    skipMode: "etag",
  };
}

describe("wranglerEnv", () => {
  it("hands R2_UPLOAD_TOKEN to Wrangler as its CLOUDFLARE_API_TOKEN", () => {
    expect(
      wranglerEnv({
        CLOUDFLARE_API_TOKEN: "pages-read",
        PATH: "/bin",
        R2_UPLOAD_TOKEN: "r2-admin",
      }),
    ).toEqual({ CLOUDFLARE_API_TOKEN: "r2-admin", PATH: "/bin", R2_UPLOAD_TOKEN: "r2-admin" });
  });

  it("drops an inherited CLOUDFLARE_API_TOKEN without an upload token, leaving wrangler login", () => {
    expect(
      wranglerEnv({ CLOUDFLARE_API_TOKEN: "pages-read", PATH: "/bin", R2_UPLOAD_TOKEN: "" }),
    ).toEqual({ PATH: "/bin", R2_UPLOAD_TOKEN: "" });
  });
});

describe("r2UploadOptionsFromEnv", () => {
  it("defaults to the production bucket & origin", () => {
    expect(r2UploadOptionsFromEnv({})).toEqual({
      bucket: "mistria-fyi-assets",
      dryRun: false,
      force: false,
      origin: "https://assets.mistria.fyi",
      parallel: 8,
    });
  });

  it("reads overrides, ignoring an invalid PARALLEL", () => {
    expect(
      r2UploadOptionsFromEnv({
        ASSET_ORIGIN: "http://localhost:8080",
        DRY_RUN: "1",
        FORCE: "1",
        PARALLEL: "zero",
        R2_BUCKET: "staging",
      }),
    ).toEqual({
      bucket: "staging",
      dryRun: true,
      force: true,
      origin: "http://localhost:8080",
      parallel: 8,
    });
  });
});

describe("listFiles", () => {
  it("lists nested files as sorted, `/`-separated relative paths", async () => {
    const dir = tree({ "b.webp": "", "items/a.webp": "", "items/deep/c.webp": "" });
    await expect(listFiles(dir)).resolves.toEqual(["b.webp", "items/a.webp", "items/deep/c.webp"]);
  });
});

describe("findPendingUploads", () => {
  it("lists new, changed, & unreachable files, never current ones, without uploading", async () => {
    const dir = tree({
      "items/changed.webp": "changed",
      "items/new.webp": "new",
      "items/same.webp": "same",
      "notes.txt": "x",
    });
    const io = fakeIo({
      "https://assets.example/sprites/items/changed.webp": new Response(null, {
        headers: { etag: `"${md5("old")}"` },
      }),
      "https://assets.example/sprites/items/same.webp": new Response(null, {
        headers: { etag: `"${md5("same")}"` },
      }),
    });

    await expect(findPendingUploads(sprites(dir), options, io)).resolves.toEqual([
      { key: "sprites/items/changed.webp", status: "changed" },
      { key: "sprites/items/new.webp", status: "missing" },
    ]);
    expect(io.puts).toEqual([]);
  });

  it("reports an unreachable origin as unknown instead of as a file to upload", async () => {
    const dir = tree({ "a.webp": "" });
    const io = fakeIo();
    io.fetch = () => Promise.reject(new TypeError("fetch failed"));

    await expect(findPendingUploads(sprites(dir), options, io)).resolves.toEqual([
      { key: "sprites/a.webp", status: "unreachable" },
    ]);
  });

  it("reports a non-404 failure or a missing ETag as unreachable, never as missing", async () => {
    const dir = tree({ "a.webp": "a", "b.webp": "b", "c.webp": "c" });
    const io = fakeIo({
      "https://assets.example/sprites/a.webp": new Response(null, { status: 503 }),
      "https://assets.example/sprites/b.webp": new Response(null, { status: 403 }),
      "https://assets.example/sprites/c.webp": new Response(null, { status: 200 }),
    });

    await expect(findPendingUploads(sprites(dir), options, io)).resolves.toEqual([
      { key: "sprites/a.webp", status: "unreachable" },
      { key: "sprites/b.webp", status: "unreachable" },
      { key: "sprites/c.webp", status: "unreachable" },
    ]);
    await expect(
      findPendingUploads({ ...sprites(dir), skipMode: "exists" }, options, io),
    ).resolves.toEqual([
      { key: "sprites/a.webp", status: "unreachable" },
      { key: "sprites/b.webp", status: "unreachable" },
    ]);
  });

  it("bounds each check with a timeout signal", async () => {
    const dir = tree({ "a.webp": "a" });
    const io = fakeIo();
    const signals: (AbortSignal | null | undefined)[] = [];
    const { fetch } = io;
    io.fetch = (input, init) => {
      signals.push(init?.signal);
      return fetch(input, init);
    };

    await findPendingUploads(sprites(dir), options, io);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("is empty when every object is current, & in exists mode when each exists", async () => {
    const dir = tree({ "a.webp": "a" });
    const io = fakeIo({
      "https://assets.example/sprites/a.webp": new Response(null, { status: 200 }),
    });

    await expect(
      findPendingUploads({ ...sprites(dir), skipMode: "exists" }, options, io),
    ).resolves.toEqual([]);
  });
});

describe("r2UploadTree", () => {
  it("uploads changed files, skips ones whose ETag matches, & ignores other extensions", async () => {
    const dir = tree({ "items/new.webp": "new", "items/same.webp": "same", "notes.txt": "x" });
    const io = fakeIo({
      "https://assets.example/sprites/items/same.webp": new Response(null, {
        headers: { etag: `"${md5("same")}"` },
      }),
    });

    await expect(r2UploadTree(sprites(dir), options, io)).resolves.toBe(true);

    expect(io.puts).toEqual([
      [
        "r2",
        "object",
        "put",
        "bucket/sprites/items/new.webp",
        "--remote",
        "--file",
        path.join(dir, "items/new.webp"),
        "--content-type",
        "image/webp",
        "--cache-control",
        "public, max-age=86400",
      ],
    ]);
    expect(io.lines.toSorted()).toEqual([
      "Done: 2 objects staged for bucket",
      "put  sprites/items/new.webp",
      "skip sprites/items/same.webp",
    ]);
  });

  it("re-uploads a file whose remote ETag differs", async () => {
    const dir = tree({ "a.webp": "changed" });
    const io = fakeIo({
      "https://assets.example/sprites/a.webp": new Response(null, {
        headers: { etag: `"${md5("old")}"` },
      }),
    });
    await r2UploadTree(sprites(dir), options, io);
    expect(io.puts).toHaveLength(1);
  });

  it("checks ETags past a stale edge copy of the bare URL", async () => {
    const dir = tree({ "a.webp": "current" });
    const io = fakeIo();
    const fetched: string[] = [];
    io.fetch = (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      fetched.push(url);
      const etag = md5(url.includes("?") ? "current" : "old");
      return Promise.resolve(new Response(null, { headers: { etag: `"${etag}"` } }));
    };

    await r2UploadTree(sprites(dir), options, io);
    await r2UploadTree(sprites(dir), options, io);

    expect(io.puts).toEqual([]);
    // Each check gets its own cache key, so a check can't hit an edge copy cached by an earlier one.
    expect(new Set(fetched).size).toBe(2);
  });

  it("skips an existing object in exists mode, with the immutable policy by default", async () => {
    const dir = tree({ "f/1.woff2": "", "f/2.woff2": "" });
    const io = fakeIo({ "https://assets.example/fonts/f/1.woff2": new Response(null) });
    const fonts: R2UploadTree = {
      contentType: "font/woff2",
      dir,
      extension: ".woff2",
      keyPrefix: "fonts/",
      skipMode: "exists",
    };

    await r2UploadTree(fonts, options, io);

    expect(io.puts.map((args) => args[3])).toEqual(["bucket/fonts/f/2.woff2"]);
    expect(io.puts[0]?.at(-1)).toBe(IMMUTABLE_CACHE_CONTROL);
  });

  it("uploads everything with force & nothing with a dry run", async () => {
    const dir = tree({ "a.webp": "same" });
    const remote = {
      "https://assets.example/sprites/a.webp": new Response(null, {
        headers: { etag: md5("same") },
      }),
    };

    const forced = fakeIo(remote);
    await r2UploadTree(sprites(dir), { ...options, force: true }, forced);
    expect(forced.puts).toHaveLength(1);

    const dryRun = fakeIo();
    await r2UploadTree(sprites(dir), { ...options, dryRun: true }, dryRun);
    expect(dryRun.puts).toEqual([]);
    expect(dryRun.lines).toContain("would put sprites/a.webp");
  });

  it("treats an unreachable origin as not current", async () => {
    const dir = tree({ "a.webp": "" });
    const io = fakeIo();
    io.fetch = () => Promise.reject(new TypeError("fetch failed"));
    await r2UploadTree(sprites(dir), options, io);
    expect(io.puts).toHaveLength(1);
  });

  it("retries a failed put, then reports Wrangler's last output", async () => {
    const dir = tree({ "a.webp": "", "b.webp": "" });
    const failure = { ok: false, output: "fetch failed\nretry later\n" };
    const io = fakeIo({}, [failure, failure, failure]);

    await expect(r2UploadTree(sprites(dir), { ...options, parallel: 1 }, io)).resolves.toBe(false);

    expect(io.puts.map((args) => args[3])).toEqual([
      "bucket/sprites/a.webp",
      "bucket/sprites/a.webp",
      "bucket/sprites/a.webp",
      "bucket/sprites/b.webp",
    ]);
    expect(io.errors).toEqual([
      "FAILED sprites/a.webp",
      "  wrangler: fetch failed",
      "  wrangler: retry later",
      "Some uploads failed; rerun to retry them.",
    ]);
    expect(io.lines).toEqual(["put  sprites/b.webp"]);
  });
});
