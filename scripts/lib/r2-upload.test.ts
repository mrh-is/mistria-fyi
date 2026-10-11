import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  IMMUTABLE_CACHE_CONTROL,
  listFiles,
  r2UploadOptionsFromEnv,
  r2UploadTree,
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

/** Remote objects by URL, as HEAD responses; Wrangler results are consumed in order. */
function fakeIo(remote: Record<string, Response> = {}, results: WranglerResult[] = []): FakeIo {
  const io: FakeIo = {
    errors: [],
    fetch: (input) =>
      Promise.resolve(
        remote[input instanceof Request ? input.url : input.toString()]?.clone() ??
          new Response(null, { status: 404 }),
      ),
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
