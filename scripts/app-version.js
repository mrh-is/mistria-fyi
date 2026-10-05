import { execFileSync } from "node:child_process";

const COMMIT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const SHORT_COMMIT_LENGTH = 8;

/**
 * @param {string} commitDate
 * @param {string} commit
 */
export function formatAppVersion(commitDate, commit) {
  const normalizedDate = commitDate.trim();
  const normalizedCommit = commit.trim();

  if (!COMMIT_DATE_PATTERN.test(normalizedDate) || !COMMIT_PATTERN.test(normalizedCommit)) {
    throw new Error("Invalid Git metadata for the application version");
  }

  return `${normalizedDate.replaceAll("-", ".")} (${normalizedCommit.slice(0, SHORT_COMMIT_LENGTH)})`;
}

/** @param {string[]} args */
function readGit(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

/**
 * @param {string} [environment]
 * @param {(args: string[]) => string} [readGitValue]
 */
export function getAppVersion(environment = process.env.NODE_ENV, readGitValue = readGit) {
  if (environment !== "production") {
    return "dev";
  }

  const commitDate = readGitValue(["show", "-s", "--format=%cs", "HEAD"]);
  const commit = readGitValue(["rev-parse", "HEAD"]);

  return formatAppVersion(commitDate, commit);
}
