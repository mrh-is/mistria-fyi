import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkAssignments, readIssue, updateIssue } from "#scripts/issue-fields";
import { startWork } from "#scripts/start-work";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("#scripts/issue-fields", () => ({
  checkAssignments: vi.fn(),
  readIssue: vi.fn(),
  updateIssue: vi.fn(),
}));

const exec = vi.mocked(execFileSync);
const todo = { type: "Task", fields: {}, status: "Todo" };
const claimedByCodex = { type: "Task", fields: { Agent: "Codex" }, status: "In progress" };
const unclaimed = {
  assignees: [],
  blockedBy: { nodes: [] },
  closedByPullRequestsReferences: [],
  labels: [],
  state: "OPEN",
};

beforeEach(() => {
  exec.mockReset();
  vi.mocked(checkAssignments).mockReset();
  vi.mocked(readIssue).mockReset().mockReturnValue(todo);
  vi.mocked(updateIssue).mockReset();
});

function mockLogin(): void {
  exec
    .mockReturnValueOnce("billyleet")
    .mockReturnValueOnce("https://github.com/mrh-is/mistria-fyi");
}

function mockWorktree(): void {
  const root = realpathSync(process.cwd());
  exec
    .mockReturnValueOnce(root)
    .mockReturnValueOnce(join(root, "scripts"))
    .mockReturnValueOnce(join(root, "docs"))
    .mockReturnValueOnce("");
}

function mockPr(body: string, state = "OPEN"): void {
  exec.mockReturnValueOnce(
    JSON.stringify({
      assignees: [{ login: "mrh-is" }],
      body,
      closingIssuesReferences: [],
      state,
    }),
  );
}

function issueEdits() {
  return exec.mock.calls.filter(
    ([command, args]) => command === "gh" && args?.[0] === "issue" && args[1] === "edit",
  );
}

function mockIssueClaim(readBack: unknown): void {
  mockLogin();
  exec
    .mockReturnValueOnce(JSON.stringify(unclaimed))
    .mockReturnValueOnce("")
    .mockReturnValueOnce(JSON.stringify(unclaimed))
    .mockReturnValueOnce("")
    .mockReturnValueOnce(JSON.stringify(readBack));
}

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
    [{ assignees: [{ login: "mrh-is" }] }, "already has an owner"],
    [{ assignees: [{ login: "billyleet" }, { login: "mrh-is" }] }, "already has an owner"],
    [{ blockedBy: { nodes: [{ state: "OPEN" }] } }, "blocked"],
    [{ labels: [{ name: "needs decision" }] }, "awaiting a decision"],
  ])("stops before setup when the issue has a conflict", (fields, message) => {
    mockLogin();
    exec.mockReturnValueOnce(JSON.stringify({ ...unclaimed, ...fields }));
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow(message);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["an In progress status", { type: "Task", fields: {}, status: "In progress" }],
    ["an In review status", { type: "Task", fields: {}, status: "In review" }],
    ["an Agent field", { type: "Task", fields: { Agent: "Claude" }, status: "Todo" }],
  ])("stops before setup when the issue has %s", (_name, state) => {
    mockLogin();
    exec.mockReturnValueOnce(JSON.stringify(unclaimed));
    vi.mocked(readIssue).mockReturnValue(state);
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow("already has an owner");
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it("stops before setup when the agent is not an Agent field option", () => {
    exec
      .mockReturnValueOnce("billyleet")
      .mockReturnValueOnce("https://github.com/mrh-is/mistria-fyi");
    vi.mocked(checkAssignments).mockImplementation(() => {
      throw new Error('Unknown Agent "kilo".');
    });
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "kilo"]);
    }).toThrow("Unknown Agent");
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("accepts an issue already assigned to the current user", () => {
    mockLogin();
    exec
      .mockReturnValueOnce(JSON.stringify({ ...unclaimed, assignees: [{ login: "billyleet" }] }))
      .mockImplementationOnce(() => {
        throw new Error("setup failed");
      });
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow("setup failed");
  });

  it("does not claim an issue when worktree setup fails", () => {
    mockLogin();
    exec.mockReturnValueOnce(JSON.stringify(unclaimed)).mockImplementationOnce(() => {
      throw new Error("setup failed");
    });
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow("setup failed");
    expect(issueEdits()).toEqual([]);
  });

  it("refuses to start an issue with an open implementation PR", () => {
    const url = "https://github.com/mrh-is/mistria-fyi/pull/456";
    mockLogin();
    exec
      .mockReturnValueOnce(
        JSON.stringify({ ...unclaimed, closedByPullRequestsReferences: [{ url }] }),
      )
      .mockReturnValueOnce("OPEN");
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow("open implementation PR");
    expect(exec).toHaveBeenCalledWith(
      "gh",
      ["pr", "view", url, "--json", "state", "--jq", ".state"],
      expect.anything(),
    );
    expect(issueEdits()).toEqual([]);
  });

  it("sets up and verifies the complete issue claim", () => {
    mockIssueClaim({ ...unclaimed, assignees: [{ login: "billyleet" }] });
    vi.mocked(readIssue)
      .mockReturnValueOnce(todo)
      .mockReturnValueOnce(todo)
      .mockReturnValueOnce(claimedByCodex);
    startWork(["issue", "123", "fix-navigation", "codex"]);
    expect(exec).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/new-worktree\.ts$/), "123-fix-navigation"],
      { stdio: "inherit" },
    );
    expect(issueEdits()).toEqual([
      ["gh", ["issue", "edit", "123", "--add-assignee", "billyleet"], { stdio: "inherit" }],
    ]);
    expect(updateIssue).toHaveBeenCalledWith("123", ["status=In progress", "agent=codex"]);
  });

  it("names the recovery command when the status & Agent update fails after assignment", () => {
    mockIssueClaim({ ...unclaimed, assignees: [{ login: "billyleet" }] });
    vi.mocked(updateIssue).mockImplementation(() => {
      throw new Error("INSUFFICIENT_SCOPES");
    });
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow("pnpm run issue-fields claim 123 codex");
  });

  it("reports when GitHub does not reflect the issue claim", () => {
    mockIssueClaim(unclaimed);
    expect(() => {
      startWork(["issue", "123", "fix-navigation", "codex"]);
    }).toThrow("claim could not be verified");
    expect(issueEdits()).toHaveLength(1);
  });

  it("sets up the current task branch without GitHub calls", () => {
    mockWorktree();
    exec.mockReturnValueOnce("task-branch");
    startWork(["task", "--current"]);
    expect(exec).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/setup-worktree\.ts$/)],
      { stdio: "inherit" },
    );
    expect(exec.mock.calls.every(([command]) => command !== "gh")).toBe(true);
  });

  it("claims in the current worktree without an Agent value for human work", () => {
    mockLogin();
    exec.mockReturnValueOnce(JSON.stringify(unclaimed));
    mockWorktree();
    exec
      .mockReturnValueOnce("task-branch")
      .mockReturnValueOnce("")
      .mockReturnValueOnce(JSON.stringify(unclaimed))
      .mockReturnValueOnce("")
      .mockReturnValueOnce(JSON.stringify({ ...unclaimed, assignees: [{ login: "billyleet" }] }));
    vi.mocked(readIssue)
      .mockReturnValueOnce(todo)
      .mockReturnValueOnce(todo)
      .mockReturnValueOnce({ type: "Task", fields: {}, status: "In progress" });
    startWork(["issue", "123", "--current", "human"]);
    expect(exec).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/setup-worktree\.ts$/)],
      { stdio: "inherit" },
    );
    expect(issueEdits()).toEqual([
      ["gh", ["issue", "edit", "123", "--add-assignee", "billyleet"], { stdio: "inherit" }],
    ]);
    expect(updateIssue).toHaveBeenCalledWith("123", ["status=In progress", "agent=-"]);
    expect(checkAssignments).not.toHaveBeenCalled();
  });

  it("updates both owners on an explicit takeover with a standalone Refs line", () => {
    const root = realpathSync(process.cwd());
    const previous = { ...unclaimed, assignees: [{ login: "mrh-is" }] };
    const next = { ...previous, assignees: [{ login: "billyleet" }] };
    vi.mocked(readIssue).mockReturnValue(claimedByCodex);
    const outputs = [
      "billyleet",
      "https://github.com/mrh-is/mistria-fyi",
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
      ["issue", "edit", "123", "--add-assignee", "billyleet", "--remove-assignee", "mrh-is"],
      { stdio: "inherit" },
    );
    expect(updateIssue).toHaveBeenCalledWith("123", ["status=In progress", "agent=codex"]);
    expect(readIssue).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(
      "gh",
      ["pr", "edit", "456", "--add-assignee", "billyleet", "--remove-assignee", "mrh-is"],
      { stdio: "inherit" },
    );
  });

  it.each([
    ["Refs #123\nRefs #124", "OPEN", "references multiple issues"],
    ["Refs #123", "CLOSED", "requires an open PR"],
  ])("refuses an ambiguous or closed PR before checkout", (body, state, message) => {
    mockLogin();
    mockWorktree();
    mockPr(body, state);
    expect(() => {
      startWork(["takeover", "456", "--current", "codex"]);
    }).toThrow(message);
    expect(exec).not.toHaveBeenCalledWith("gh", ["pr", "checkout", "456"], expect.anything());
    expect(issueEdits()).toEqual([]);
  });

  it.each([
    ["Refs #123", true],
    ["Refs #123.", false],
  ])("skips a closed linked issue or warns when it cannot find one (%s)", (body, closedIssue) => {
    const warn = vi.spyOn(console, "warn").mockReturnValue(undefined);
    mockLogin();
    mockWorktree();
    mockPr(body);
    if (closedIssue) {
      exec.mockReturnValueOnce(JSON.stringify({ ...unclaimed, state: "CLOSED" }));
    }
    exec
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce(JSON.stringify({ assignees: [{ login: "mrh-is" }] }));
    try {
      expect(() => {
        startWork(["takeover", "456", "--current", "codex"]);
      }).toThrow("handoff could not be verified");
      expect(issueEdits()).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(closedIssue ? 0 : 1);
    } finally {
      warn.mockRestore();
    }
  });
});
