import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { startWork } from "#scripts/start-work";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const exec = vi.mocked(execFileSync);
const unclaimed = {
  assignees: [],
  blockedBy: { nodes: [] },
  labels: [{ name: "status: ready" }],
  state: "OPEN",
};

beforeEach(() => {
  exec.mockReset();
});

describe("start work", () => {
  it("sets up ad hoc work without GitHub access", () => {
    startWork(["task", "fix-navigation"]);
    expect(exec).toHaveBeenCalledExactlyOnceWith(
      process.execPath,
      [expect.stringMatching(/new-worktree\.ts$/), "fix-navigation"],
      { stdio: "inherit" },
    );
  });

  it("checks the intended owner before touching Git or GitHub state", () => {
    exec.mockReturnValueOnce("billyleet");
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex", "mrh-is"]);
    }).toThrow("does not match");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ assignees: [{ login: "billyleet" }] }, "already has an owner"],
    [{ blockedBy: { nodes: [{ state: "OPEN" }] } }, "blocked"],
  ])("stops before setup when the issue has a conflict", (fields, message) => {
    exec
      .mockReturnValueOnce("billyleet")
      .mockReturnValueOnce("https://github.com/mrh-is/mistria-fyi")
      .mockReturnValueOnce("{}")
      .mockReturnValueOnce(JSON.stringify({ ...unclaimed, ...fields }));
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow(message);
    expect(exec).toHaveBeenCalledTimes(4);
  });

  it("sets up, rechecks the issue, and verifies the complete claim", () => {
    exec
      .mockReturnValueOnce("billyleet")
      .mockReturnValueOnce("https://github.com/mrh-is/mistria-fyi")
      .mockReturnValueOnce("{}")
      .mockReturnValueOnce(JSON.stringify(unclaimed))
      .mockReturnValueOnce("")
      .mockReturnValueOnce(JSON.stringify(unclaimed))
      .mockReturnValueOnce("")
      .mockReturnValueOnce(
        JSON.stringify({
          ...unclaimed,
          assignees: [{ login: "billyleet" }],
          labels: [{ name: "status: in progress" }, { name: "agent: codex" }],
        }),
      );
    startWork(["issue", "123", "fix-navigation", "codex"]);
    expect(exec).toHaveBeenNthCalledWith(
      5,
      process.execPath,
      [expect.stringMatching(/new-worktree\.ts$/), "123-fix-navigation"],
      { stdio: "inherit" },
    );
    expect(exec).toHaveBeenNthCalledWith(
      7,
      "gh",
      [
        "issue",
        "edit",
        "123",
        "--add-assignee",
        "billyleet",
        "--add-label",
        "status: in progress",
        "--add-label",
        "agent: codex",
        "--remove-label",
        "status: ready",
      ],
      { stdio: "inherit" },
    );
    expect(exec).toHaveBeenCalledTimes(8);
  });

  it("updates both owners on an explicit takeover with a standalone Refs line", () => {
    const root = realpathSync(process.cwd());
    const previous = {
      ...unclaimed,
      assignees: [{ login: "mrh-is" }],
      labels: [{ name: "status: in progress" }, { name: "agent: claude" }],
    };
    const next = {
      ...previous,
      assignees: [{ login: "billyleet" }],
      labels: [{ name: "status: in progress" }, { name: "agent: codex" }],
    };
    const outputs = [
      "billyleet",
      "https://github.com/mrh-is/mistria-fyi",
      "{}",
      root,
      join(root, "scripts"),
      join(root, "docs"),
      "",
      JSON.stringify({
        assignees: previous.assignees,
        body: "Refs #123\n",
        closingIssuesReferences: [],
        state: "OPEN",
      }),
      JSON.stringify(previous),
      JSON.stringify(previous),
      "",
      "",
      JSON.stringify(previous),
      "",
      JSON.stringify(next),
      "",
      JSON.stringify({ assignees: next.assignees }),
    ];
    for (const output of outputs) {
      exec.mockReturnValueOnce(output);
    }
    startWork(["takeover", "456", "--current", "codex"]);
    expect(exec).toHaveBeenCalledWith("gh", ["pr", "checkout", "456"], { stdio: "inherit" });
    expect(exec).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["--remove-assignee", "mrh-is", "--remove-label", "agent: claude"]),
      { stdio: "inherit" },
    );
    expect(exec).toHaveBeenCalledWith(
      "gh",
      ["pr", "edit", "456", "--add-assignee", "billyleet", "--remove-assignee", "mrh-is"],
      { stdio: "inherit" },
    );
  });
});
