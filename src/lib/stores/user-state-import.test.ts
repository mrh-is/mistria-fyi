import { afterEach, describe, expect, it } from "vitest";

import { userState } from "$lib/stores/user-state.svelte.js";

describe("importState validation", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("succeeds with a valid backup", () => {
    const json = userState.exportState();
    const result = userState.importState(json);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed JSON", () => {
    const result = userState.importState("not json {{{");
    expect(result).toEqual({ error: "malformed-json", ok: false });
  });

  it("rejects non-object JSON", () => {
    const result = userState.importState('"just a string"');
    expect(result).toEqual({ error: "malformed-json", ok: false });
  });

  it("rejects null JSON", () => {
    const result = userState.importState("null");
    expect(result).toEqual({ error: "malformed-json", ok: false });
  });

  it("rejects JSON without a version field", () => {
    const result = userState.importState(JSON.stringify({ completed: {} }));
    expect(result).toEqual({ error: "malformed-json", ok: false });
  });

  it("rejects an unsupported version", () => {
    const json = userState.exportState();
    const data = JSON.parse(json) as Record<string, unknown>;
    data.version = "99";
    const result = userState.importState(JSON.stringify(data));
    expect(result).toEqual({ error: "unsupported-version", ok: false });
  });

  it("rejects a backup missing the completed object", () => {
    const result = userState.importState(JSON.stringify({ version: "1" }));
    expect(result).toEqual({ error: "invalid-fields", ok: false });
  });

  it("rejects a backup with invalid completed structure", () => {
    const result = userState.importState(
      JSON.stringify({ completed: "not an object", version: "1" }),
    );
    expect(result).toEqual({ error: "invalid-fields", ok: false });
  });

  it("preserves existing state after a failed import", () => {
    const json = userState.exportState();
    const original = JSON.parse(json) as Record<string, unknown>;

    const badResult = userState.importState("not json");
    expect(badResult.ok).toBe(false);

    const afterFail = JSON.parse(userState.exportState()) as Record<string, unknown>;
    expect(afterFail).toEqual(original);
  });

  it("replaces state on successful import", () => {
    const json = userState.exportState();
    const data = JSON.parse(json) as Record<string, unknown>;
    const completed = data.completed as Record<string, unknown>;
    completed.renown = 15;
    data.completed = completed;

    const result = userState.importState(JSON.stringify(data));
    expect(result.ok).toBe(true);
    expect(userState.state.completed.renown).toBe(15);
  });
});
