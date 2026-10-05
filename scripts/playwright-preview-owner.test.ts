import { describe, expect, it } from "vitest";

import { assessPreviewProbe, classifyOwnerResponse } from "./playwright-preview-owner.js";

const url = "http://127.0.0.1:41234";
const checkout = "/repo/.worktrees/330";
const owner = { checkout: "/repo/.worktrees/other", startedAt: "2026-09-19T12:00:00.000Z" };

describe("classifyOwnerResponse", () => {
  it("recognizes a stamped preview", () => {
    expect(classifyOwnerResponse(200, owner)).toEqual({ kind: "owner", owner });
  });

  it("treats a missing or malformed owner file as a foreign server", () => {
    expect(classifyOwnerResponse(404, null)).toEqual({ kind: "foreign", status: 404 });
    expect(classifyOwnerResponse(200, { checkout: 1 })).toEqual({ kind: "foreign", status: 200 });
    expect(classifyOwnerResponse(200, "<html>")).toEqual({ kind: "foreign", status: 200 });
  });
});

describe("assessPreviewProbe", () => {
  it("allows a free port", () => {
    expect(assessPreviewProbe({ kind: "unreachable" }, url, checkout)).toBeNull();
  });

  it("names the other checkout when its preview holds the port", () => {
    const message = assessPreviewProbe({ kind: "owner", owner }, url, checkout);

    expect(message).toContain(owner.checkout);
    expect(message).toContain(`instead of ${checkout}`);
    expect(message).toContain("PLAYWRIGHT_PORT");
  });

  it("refuses a leftover preview from the same checkout", () => {
    const message = assessPreviewProbe(
      { kind: "owner", owner: { ...owner, checkout } },
      url,
      checkout,
    );

    expect(message).toContain("this checkout");
    expect(message).toContain(owner.startedAt);
  });

  it("refuses a server that is not a preview", () => {
    expect(assessPreviewProbe({ kind: "foreign", status: 404 }, url, checkout)).toContain(
      "not a Playwright preview (HTTP 404",
    );
  });
});
