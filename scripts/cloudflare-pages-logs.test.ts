import { describe, expect, it, vi } from "vitest";

import {
  fetchPagesDeploymentLogs,
  formatPagesDeploymentLogs,
  pagesDeploymentLogsUrl,
} from "./cloudflare-pages-logs";

describe("pagesDeploymentLogsUrl", () => {
  it("targets the configured account, project, and deployment", () => {
    expect(pagesDeploymentLogsUrl("account-id", "deployment-id", "mistria-fyi")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/mistria-fyi/deployments/deployment-id/history/logs",
    );
  });

  it("escapes path segments", () => {
    expect(pagesDeploymentLogsUrl("account/id", "deployment id", "project name")).toContain(
      "/accounts/account%2Fid/pages/projects/project%20name/deployments/deployment%20id/",
    );
  });
});

describe("fetchPagesDeploymentLogs", () => {
  it("sends a configured token without requiring one for a credential proxy", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({ result: { data: [], includes_container_logs: false, total: 0 } }),
      ),
    );

    await fetchPagesDeploymentLogs("https://example.com/logs", "token", fetchMock);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/logs", {
      headers: { Authorization: "Bearer token" },
    });

    await fetchPagesDeploymentLogs("https://example.com/logs", undefined, fetchMock);
    expect(fetchMock).toHaveBeenLastCalledWith("https://example.com/logs", {});
  });

  it("surfaces the Cloudflare response when a request fails", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("forbidden", { status: 403 })));

    await expect(
      fetchPagesDeploymentLogs("https://example.com/logs", undefined, fetchMock),
    ).rejects.toThrow("Cloudflare returned HTTP 403: forbidden");
  });
});

describe("formatPagesDeploymentLogs", () => {
  it("prints one timestamped line per build-log entry", () => {
    expect(
      formatPagesDeploymentLogs({
        result: {
          data: [
            { line: "Cloning repository", ts: "2026-09-27T12:00:00Z" },
            { line: "Build complete", ts: "2026-09-27T12:01:00Z" },
          ],
          includes_container_logs: true,
          total: 2,
        },
      }),
    ).toBe("2026-09-27T12:00:00Z Cloning repository\n2026-09-27T12:01:00Z Build complete");
  });
});
