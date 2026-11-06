import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = readFileSync(new URL("../static/.well-known/security.txt", import.meta.url), "utf8");
const securityPolicy = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");

function field(name: string): string | undefined {
  return new RegExp(`^${name}: (.+)$`, "m").exec(file)?.[1];
}

describe("security.txt (RFC 9116)", () => {
  it("has the required Contact, Expires, & Canonical fields", () => {
    expect(field("Contact")).toBe("mailto:michael@mistria.fyi");
    expect(field("Canonical")).toBe("https://mistria.fyi/.well-known/security.txt");
    expect(field("Expires")).toBeDefined();
  });

  it("expires more than 30 days from now, so it gets refreshed before it lapses", () => {
    const expires = new Date(field("Expires") ?? "");
    expect(Number.isNaN(expires.getTime())).toBe(false);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(expires.getTime() - Date.now()).toBeGreaterThan(thirtyDays);
  });

  it("is mentioned in SECURITY.md so the two stay in sync", () => {
    expect(securityPolicy).toContain("https://mistria.fyi/.well-known/security.txt");
  });
});
