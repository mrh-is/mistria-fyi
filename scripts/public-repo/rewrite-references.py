"""Shared filter callbacks & independent candidate audits. No third-party Python dependencies."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

REPO = b"mrh-is/mistria-fyi"
URL = (
    rb"https://github\.com/mrh-is/mistria-fyi/(?:issues|pull)/"
    rb"(?P<url_number>\d+)(?!\d)(?:[/?#][^\s<>\)\]]*)?"
)
REFERENCE = re.compile(
    URL + rb"|(?<![\w/.-])(?:mrh-is/mistria-fyi)?#(?P<bare_number>\d+)\b"
)
# Match a link before its URL so removing an unmapped target also removes its link syntax.
# Preserve mapped link labels, optional angle delimiters, titles, & URL suffixes unchanged.
MARKDOWN_LINK = (
    rb"\[(?P<label>(?:\\.|[^\[\]\\\n]|\[[^\[\]\n]*\])*)\]\([ \t]*"
    rb"(?P<angle><)?"
    + URL.replace(b"url_number", b"markdown_number")
    + rb"""(?(angle)>)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^\)\n]*\)))?[ \t]*\)"""
)
URL_ONLY = re.compile(MARKDOWN_LINK + b"|" + URL)
# A home-directory prefix: the macOS form between forward slashes (which also covers Windows
# forward-slash & Git Bash paths), or the Windows form between backslashes in any case. Built from
# parts so this file never contains a literal prefix the audit rejects. Bracketed backslashes stay
# literal in POSIX ERE, and the pattern doesn't end in a backslash: Windows argument quoting can
# drop one there, turning the regex invalid or into one that silently matches nothing.
HOME_PREFIX = "/" + "Users/|" + r"[\\][Uu][Ss][Ee][Rr][Ss][\\]"


def git(repo, *args, data=None):
    return subprocess.check_output(["git", "-C", str(repo), *args], input=data)


class Rewriter:
    def __init__(self, issues_file, mapping_file):
        # Read bytes or name UTF-8 throughout: Windows' default text encoding is a legacy code page.
        pages = json.loads(Path(issues_file).read_bytes())
        if not isinstance(pages, list) or not pages:
            raise ValueError("issue export must be a nonempty JSON array")
        issues = (
            [issue for page in pages for issue in page]
            if isinstance(pages[0], list)
            else pages
        )
        self.kinds = {}
        for issue in issues:
            number = issue["number"]
            if not isinstance(number, int) or number <= 0 or number in self.kinds:
                raise ValueError("invalid or duplicate issue number in export")
            self.kinds[number] = "PR" if "pull_request" in issue else "issue"
        self.mapping = {}
        for line in Path(mapping_file).read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not re.fullmatch(r"[1-9]\d*\s+[1-9]\d*", line.strip()):
                raise ValueError("mapping rows must be positive integers: old new")
            old, new = map(int, line.split())
            if old not in self.kinds or self.kinds[old] != "issue":
                raise ValueError(f"mapping source {old} is not an exported issue")
            if old in self.mapping or new in self.mapping.values():
                raise ValueError("mapping must have unique source & destination numbers")
            self.mapping[old] = new
        self.report = None
        self.messages = {}
        self.paths = {}

    def rewrite(self, content, message=False, location=None):
        # Treat NUL-containing file blobs as binary, consistently in filtering & tree auditing.
        if not message and b"\0" in content:
            return content
        pattern = REFERENCE if message else URL_ONLY

        def replace(match):
            groups = match.groupdict()
            url_number = groups.get("markdown_number") or groups.get("url_number")
            number = int(url_number or groups["bare_number"])
            if number not in self.kinds:
                return match.group(0)
            if number in self.mapping:
                new = str(self.mapping[number]).encode()
                if url_number is not None:
                    number_group = "markdown_number" if groups.get("markdown_number") else "url_number"
                    start = match.start(number_group) - match.start()
                    end = match.end(number_group) - match.start()
                    replacement = match.group(0)[:start] + new + match.group(0)[end:]
                elif match.group(0).startswith(REPO):
                    replacement = REPO + b"#" + new
                else:
                    replacement = b"#" + new
            elif groups.get("label") is not None:
                replacement = groups["label"] + b" (private beta)"
            else:
                # Avoid “Merge pull request PR 123” in GitHub’s standard merge subjects.
                merge_subject = (
                    message and content[:match.start()].endswith(b"Merge pull request ")
                )
                kind = "" if merge_subject else self.kinds[number] + " "
                replacement = f"{kind}{number} (private beta)".encode()
            if self.report is not None and location is not None:
                self.report.write(
                    json.dumps({
                        **location,
                        "old": match.group(0).decode("utf-8", "replace"),
                        "new": replacement.decode("utf-8", "replace"),
                    }) + "\n"
                )
                self.report.flush()
            return replacement

        return pattern.sub(replace, content)

    def message(self, content):
        commits = self.messages.get(hashlib.sha256(content).hexdigest())
        if not commits:
            raise ValueError("callback message missing from source commit inventory")
        return self.rewrite(content, True, {"commits": commits})

    def blob(self, content, original_id):
        oid = original_id.decode()
        return self.rewrite(
            content,
            location={"blob": oid, "path": self.paths.get(oid, "(unnamed blob)")},
        )


def callback_rewriter():
    directory = Path(os.environ["CANDIDATE_AUDIT_DIR"])
    rewriter = Rewriter(directory / "issues.json", directory / "mapping.txt")
    inventory = json.loads((directory / "inventory.json").read_bytes())
    rewriter.messages = inventory["messages"]
    rewriter.paths = inventory["paths"]
    # filter-repo can compile different callbacks with separate global namespaces.
    rewriter.report = (directory / "rewrites.jsonl").open("a", encoding="utf-8")
    return rewriter


def source_messages(repo, commit):
    for oid in git(repo, "rev-list", commit).decode().splitlines():
        raw = git(repo, "cat-file", "commit", oid)
        yield oid, raw.split(b"\n\n", 1)[1]


def expected_tree(source, tree, rewriter, cache):
    if tree in cache:
        return cache[tree]
    records = []
    for entry in git(source, "ls-tree", "-z", tree).split(b"\0"):
        if not entry:
            continue
        description, name = entry.split(b"\t", 1)
        mode, kind, oid = description.split(b" ")
        if kind == b"tree":
            expected = expected_tree(source, oid.decode(), rewriter, cache)
        elif kind == b"blob":
            original = git(source, "cat-file", "blob", oid.decode())
            rewritten = rewriter.rewrite(original)
            expected = git(source, "hash-object", "--stdin", data=rewritten).strip().decode()
        else:
            expected = oid.decode()  # Gitlinks retain their exact commit IDs & modes.
        # ls-tree pads directory modes to six digits; raw Git trees use the unpadded octal form.
        records.append(mode.lstrip(b"0") + b" " + name + b"\0" + bytes.fromhex(expected))
    result = git(
        source, "hash-object", "-t", "tree", "--stdin", data=b"".join(records)
    ).strip().decode()
    cache[tree] = result
    return result


def prepare(source, commit, directory):
    # Validate the mapping before any filtering, then cache identities for rewrite reports.
    Rewriter(directory / "issues.json", directory / "mapping.txt")
    (directory / "rewrites.jsonl").write_text("")
    messages = {}
    for oid, message in source_messages(source, commit):
        messages.setdefault(hashlib.sha256(message).hexdigest(), []).append(oid)
    paths = {}
    for line in git(source, "rev-list", "--objects", commit).splitlines():
        oid, separator, path = line.partition(b" ")
        if separator:
            paths[oid.decode()] = path.decode("utf-8", "replace")
    (directory / "inventory.json").write_text(
        json.dumps({"messages": messages, "paths": paths})
    )


def audit(source, commit, candidate, directory):
    rewriter = Rewriter(directory / "issues.json", directory / "mapping.txt")
    results = []

    def passed(condition, name):
        if not condition:
            raise ValueError("FAIL: " + name)
        results.append("PASS: " + name)
        print(results[-1], flush=True)

    def excluded(path):
        return (
            path == b"static/sprites"
            or path.startswith(b"static/sprites/")
            or path.split(b"/")[-1] == b"measure-transfer-size.ts"
        )

    objects = git(candidate, "rev-list", "--objects", "--all").splitlines()
    if any(excluded(line.partition(b" ")[2]) for line in objects):
        raise ValueError("FAIL: excluded paths are unreachable")
    # rev-list names each object only once. Shared blobs/trees can hide another historical path,
    # so independently inspect every distinct reachable commit tree with NUL-delimited names.
    trees = set(git(candidate, "log", "--all", "--format=%T").decode().splitlines())
    for tree in trees:
        paths = git(candidate, "ls-tree", "-r", "-z", "--name-only", tree).split(b"\0")
        if any(excluded(path) for path in paths):
            raise ValueError("FAIL: excluded paths are unreachable")
    passed(True, "excluded paths are unreachable")
    for oid, message in source_messages(candidate, "--all"):
        scan = subprocess.run(
            ["git", "-C", candidate, "grep", "-I", "-l", "-E", "-e", HOME_PREFIX, oid],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        if scan.returncode not in (0, 1):
            raise ValueError("git grep failed: " + scan.stderr.decode("utf-8", "replace"))
        passed_scan = scan.returncode == 1
        if not passed_scan:
            raise ValueError("FAIL: home prefix in " + scan.stdout.decode("utf-8", "replace"))
        for match in REFERENCE.finditer(message):
            number = int(match.group("url_number") or match.group("bare_number"))
            if number in rewriter.kinds and number not in rewriter.mapping.values():
                raise ValueError(f"FAIL: unmapped private reference in commit {oid}")
    passed(True, "all commits contain no home-prefix text or unmapped private message references")
    source_tree = git(source, "rev-parse", commit + "^{tree}").strip().decode()
    expected = expected_tree(source, source_tree, rewriter, {})
    actual = git(candidate, "rev-parse", "main^{tree}").strip().decode()
    passed(expected == actual, "tip tree equals source after only URL reference rewrites")
    refs = git(candidate, "for-each-ref", "--format=%(refname)").decode().splitlines()
    passed(refs == ["refs/heads/main"], "only refs/heads/main exists")
    passed(not git(candidate, "remote").strip(), "candidate has no remotes")
    # Bytes keep LF line endings on Windows, matching the lines the shell script appends.
    (directory / "summary.txt").write_bytes(("\n".join(results) + "\n").encode())


if __name__ == "__main__":
    try:
        audit_directory = Path(os.environ["CANDIDATE_AUDIT_DIR"])
        if sys.argv[1] == "prepare":
            prepare(sys.argv[2], sys.argv[3], audit_directory)
        elif sys.argv[1] == "audit":
            audit(sys.argv[2], sys.argv[3], sys.argv[4], audit_directory)
        else:
            raise ValueError("unknown command")
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"error: {error}")
