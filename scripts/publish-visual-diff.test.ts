import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publishVisualDiff, reportImages, validatedMetrics } from "./publish-visual-diff.js";

const directories: string[] = [];
const sha = "a".repeat(40);
const repository = "owner/repo";
const run = {
  conclusion: "success",
  created_at: "2026-01-01T00:00:00Z",
  event: "pull_request",
  head_sha: sha,
  id: 123,
  path: ".github/workflows/visual-diff.yml",
  pull_requests: [{ number: 332 }],
  repository: { full_name: repository },
  updated_at: "2026-01-01T00:02:10Z",
};
const pr = { head: { sha }, number: 332, state: "open" };
const metrics = ["home", "almanac"].flatMap((route) =>
  ["light", "dark"].flatMap((theme) =>
    [1280, 390].map((width) => ({
      changedPixels: 0,
      id: `${route}-${theme}-${width}`,
      noisePixels: 0,
    })),
  ),
);

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), "visual-publish-"));
  directories.push(path);
  return path;
}

/** A report with all six sheets, so publication depends only on the given metrics. */
function completeReport(reportMetrics: Record<string, unknown>[] | typeof metrics): string {
  const path = directory();
  const report = join(path, "visual", "report");
  mkdirSync(report, { recursive: true });
  writeFileSync(join(report, "metrics.json"), JSON.stringify(reportMetrics));
  writeFileSync(
    join(report, "source.json"),
    JSON.stringify({ baseSha: "b".repeat(40), headSha: sha }),
  );
  for (const route of ["home", "almanac"]) {
    for (const kind of ["before", "after", "difference"]) {
      writeFileSync(
        join(report, `${route}-${kind}.png`),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
  }
  return path;
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe("visual report validation", () => {
  it("accepts the complete known state set, including explicit capture failures", () => {
    expect(validatedMetrics(metrics)).toEqual(metrics);
    expect(
      validatedMetrics(metrics.map((entry) => ({ ...entry, changedPixels: null })))[0]
        .changedPixels,
    ).toBeNull();
  });

  it.each(
    [
      [],
      [...metrics, metrics[0]],
      metrics.map(() => metrics[0]),
      metrics.map((entry) => ({ ...entry, id: "![injection](https://example.com)" })),
      metrics.map((entry) => ({ ...entry, changedPixels: -1 })),
      metrics.map((entry) => ({ ...entry, noisePixels: 1_000_000 })),
      metrics.map((entry) => ({ ...entry, changedPixels: "0" })),
    ].map((value) => ({ value })),
  )("rejects malformed or injected artifact data: %j", ({ value }) => {
    expect(() => validatedMetrics(value)).toThrow(/visual|pixel/);
  });

  it("rejects a symlink or a non-PNG instead of attaching arbitrary files", () => {
    const path = directory();
    writeFileSync(join(path, "other"), "sensitive synthetic content");
    symlinkSync(join(path, "other"), join(path, "home-before.png"));
    expect(() => reportImages(path)).toThrow("Invalid visual attachment");
    rmSync(join(path, "home-before.png"));
    writeFileSync(join(path, "home-before.png"), "not a PNG");
    expect(() => reportImages(path)).toThrow("Invalid visual attachment");
  });
});

describe("visual report publication", () => {
  it("posts a visible failure when the capture artifact is missing", async () => {
    let body = "";
    const gh = vi.fn((args: string[]) => {
      if (args[0] === "pr") {
        body = readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
        return "https://github.com/owner/repo/pull/332#issuecomment-5";
      }
      if (args.includes("--paginate")) return "[[]]";
      if (args[1].endsWith("/issues/comments/5")) {
        return JSON.stringify({ body, id: 5, user: { id: 1 } });
      }
      return JSON.stringify(
        args[1].includes("actions/runs") ? { ...run, conclusion: "failure" } : pr,
      );
    });
    expect(await publishVisualDiff({ directory: directory(), gh, repository, runId: "123" })).toBe(
      true,
    );
    expect(body).toContain("Capture workflow: failure");
    expect(body).toContain("captures are unavailable");
    expect(body).toContain("https://github.com/owner/repo/actions/runs/123");
    expect(body).not.toContain("Agent:");
    expect(gh.mock.calls.find(([args]) => args[0] === "pr")?.[0]).not.toContain("--attach");
  });

  it("refuses a run from a different workflow before reading or posting artifacts", async () => {
    const gh = vi.fn(() => JSON.stringify({ ...run, path: ".github/workflows/unrelated.yml" }));
    await expect(
      publishVisualDiff({ directory: directory(), gh, repository, runId: "123" }),
    ).rejects.toThrow("Unexpected visual workflow");
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it.each(["closed", "stale", "changed-before-post"])("doesn’t post for a %s PR", async (state) => {
    let reads = 0;
    const gh = vi.fn((args: string[]) => {
      if (args[1].includes("actions/runs")) return JSON.stringify(run);
      reads++;
      return JSON.stringify({
        ...pr,
        head: { sha: state === "stale" || reads > 1 ? "b".repeat(40) : sha },
        state: state === "closed" ? "closed" : "open",
      });
    });
    expect(await publishVisualDiff({ directory: directory(), gh, repository, runId: "123" })).toBe(
      false,
    );
    expect(gh.mock.calls.some(([args]) => args[0] === "pr")).toBe(false);
  });

  it("attaches only the six named sheets & never publishes report Markdown", async () => {
    const path = directory();
    const report = join(path, "visual", "report");
    mkdirSync(report, { recursive: true });
    writeFileSync(join(report, "metrics.json"), JSON.stringify(metrics));
    writeFileSync(
      join(report, "source.json"),
      JSON.stringify({ baseSha: "b".repeat(40), headSha: sha }),
    );
    writeFileSync(join(report, "report.md"), "Do not publish this untrusted text");
    for (const route of ["home", "almanac"]) {
      for (const kind of ["before", "after", "difference"]) {
        writeFileSync(
          join(report, `${route}-${kind}.png`),
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
      }
    }
    let body = "";
    const gh = vi.fn((args: string[]) => {
      if (args[0] === "pr") {
        body = readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
        return "https://github.com/owner/repo/pull/332#issuecomment-5";
      }
      if (args.includes("--paginate")) return "[[]]";
      if (args[1].endsWith("/issues/comments/5")) {
        return JSON.stringify({ body, id: 5, user: { id: 1 } });
      }
      return JSON.stringify(args[1].includes("actions/runs") ? run : pr);
    });
    await publishVisualDiff({ directory: path, gh, repository, runId: "123" });
    expect(body).not.toContain("Do not publish");
    expect(body).toContain("home-light-1280 | 0 | 0");
    expect(body).toContain("### Home, before");
    expect(body).toContain("### Almanac, difference");
    expect(
      gh.mock.calls.find(([args]) => args[0] === "pr")?.[0].filter((arg) => arg === "--attach"),
    ).toHaveLength(6);
  });

  it("reports captures as unavailable when a full sheet set holds failed captures", async () => {
    const path = completeReport(metrics.map((entry) => ({ ...entry, changedPixels: null })));
    let body = "";
    const gh = vi.fn((args: string[]) => {
      if (args[0] === "pr") {
        body = readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
        return "https://github.com/owner/repo/pull/332#issuecomment-5";
      }
      if (args.includes("--paginate")) return "[[]]";
      if (args[1].endsWith("/issues/comments/5")) {
        return JSON.stringify({ body, id: 5, user: { id: 1 } });
      }
      return JSON.stringify(args[1].includes("actions/runs") ? run : pr);
    });
    await publishVisualDiff({ directory: path, gh, repository, runId: "123" });
    expect(body).toContain("captures are unavailable");
    expect(body).not.toContain("Each sheet shows");
  });

  it("posts the metrics without sheets when the attachment upload is rejected", async () => {
    const path = completeReport(metrics);
    let body = "";
    const gh = vi.fn((args: string[]) => {
      if (args[0] === "pr") {
        if (args.includes("--attach")) throw new Error("upload rejected");
        body = readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
        return "https://github.com/owner/repo/pull/332#issuecomment-5";
      }
      if (args.includes("--paginate")) return "[[]]";
      if (args[1].endsWith("/issues/comments/5")) {
        return JSON.stringify({ body, id: 5, user: { id: 1 } });
      }
      return JSON.stringify(args[1].includes("actions/runs") ? run : pr);
    });
    expect(await publishVisualDiff({ directory: path, gh, repository, runId: "123" })).toBe(true);
    expect(body).toContain("home-light-1280 | 0 | 0");
    expect(body).toContain("couldn’t be attached");
    expect(body).not.toContain("### Home, before");
    expect(gh.mock.calls.filter(([args]) => args[0] === "pr")).toHaveLength(2);
  });

  it("updates only its own marked report & removes its temporary duplicate after the update", async () => {
    let body = "";
    let updated = "";
    const gh = vi.fn((args: string[]) => {
      if (args[0] === "pr") {
        body = readFileSync(args[args.indexOf("--body-file") + 1], "utf8");
        return "https://github.com/owner/repo/pull/332#issuecomment-5";
      }
      if (args.includes("--paginate")) {
        return JSON.stringify([
          [
            { body: "<!-- visual-diff-pilot --> other author", id: 1, user: { id: 2 } },
            { body: "An unrelated bot comment", id: 2, user: { id: 1 } },
            { body: "<!-- visual-diff-pilot --> previous report", id: 3, user: { id: 1 } },
          ],
        ]);
      }
      if (args.includes("PATCH")) {
        updated = readFileSync(args[args.indexOf("--input") + 1], "utf8");
        return "";
      }
      if (args.includes("DELETE")) return "";
      if (args[1].endsWith("/issues/comments/5")) {
        return JSON.stringify({ body, id: 5, user: { id: 1 } });
      }
      return JSON.stringify(args[1].includes("actions/runs") ? run : pr);
    });
    await publishVisualDiff({ directory: directory(), gh, repository, runId: "123" });
    expect(JSON.parse(updated)).toEqual({ body });
    expect(gh.mock.calls.at(-2)?.[0]).toContain("repos/owner/repo/issues/comments/3");
    expect(gh.mock.calls.at(-1)?.[0]).toEqual([
      "api",
      "--method",
      "DELETE",
      "repos/owner/repo/issues/comments/5",
    ]);
  });
});
