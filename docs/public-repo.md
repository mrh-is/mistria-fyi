# Public repository candidate

Build an offline candidate before the coordinated cutover in #671. The script never pushes or adds a
publication remote; the source checkout, its refs, & its working tree stay untouched.

## Build & inspect

Install Git, Python 3, GitHub CLI, `git-filter-repo`, & `gitleaks` on `PATH`. On macOS:

```bash
brew install git-filter-repo gitleaks
```

On Windows, run the script from Git Bash. It finds Python 3 as `python3`, `python`, or `py -3`,
skipping the Microsoft Store `python3` alias that only prints an install hint. Install the tools,
then open a new shell so `PATH` picks them up:

```bash
winget install Python.Python.3.13 Gitleaks.Gitleaks
python -m pip install --user git-filter-repo
```

pip prints a warning when its user `Scripts` directory isn't on `PATH`; add that directory so
`git filter-repo` resolves. Run the script as `bash scripts/public-repo/…` from Git Bash itself:
from `cmd.exe` or PowerShell, `bash` can resolve to WSL instead.

From an up-to-date source checkout, run:

```bash
git fetch origin main
bash scripts/public-repo/build-candidate.sh /private/tmp/mistria-public-candidate
```

The source defaults to `origin/main`. Select an older main commit with `--source <commit>`. The
output directory must be outside the checkout, have an existing parent, & not already exist
(including a symlink). The script rejects a source tip containing `static/sprites/` or
`scripts/measure-transfer-size.ts`, naming the excluded path. Only history is stripped; tip content
changes are limited to the reference rewrites below.

The clone contains only main’s selected history, with tags, remote refs, & other refs deleted before
filtering. It removes the two excluded paths from history, expires reflogs, & runs aggressive
garbage collection. If local main lags origin/main, it fetches the resolved source commit into the
candidate before resetting candidate main. It does not move source main.

Inspect these files under the candidate’s `.git/candidate-audit/`:

- `summary.txt`: successful audits, source & candidate commits, commit count, & object-store size.
- `rewrites.jsonl`: each rewritten reference, its old & new text, & its source commit IDs or blob ID
  & representative path. Review ambiguous uses, such as `#1` as a rank, before publication.
- `issues.json`: the cached issue/PR classification export, including closed entries.
- `mapping.txt`: the mapping used, empty for a dry run.
- `gitleaks.json`: the redacted secret-scanner report.
- `gitleaks.toml`: the exact scanner configuration used.

Reports live in Git metadata, so they cannot accidentally become public tracked content. A nonzero
exit means the candidate is not approved for publication; retain it for diagnosis, then rerun into a
new directory after correcting the cause.

## Reference rewrites

In commit messages, known bare `#N` & `mrh-is/mistria-fyi#N` references become
`issue N (private beta)` or `PR N (private beta)`, using the cached classification. Standard merge
subjects become `Merge pull request N (private beta) from …`. In both messages & file contents, this
repository’s issue/PR URLs receive the same treatment. Bare references in file contents remain
unchanged. Unknown numbers & references to other repositories remain unchanged.

For an unmapped Markdown link, the whole link becomes its label followed by “(private beta)”, rather
than leaving non-URL text in a link target. Mapped links retain their labels, link titles, & URL
subpaths, queries, or fragments, with only the issue number changed. Unmapped URL subpaths, queries,
& fragments are removed along with the private URL. File blobs containing a NUL byte are treated as
binary & remain byte-identical.

At cutover, pass an issue-transfer mapping, one `old new` pair per line:

```text
218 1
667 2
```

```bash
bash scripts/public-repo/build-candidate.sh \
  --source <frozen-main-commit> \
  --issues /private/tmp/mistria-dry-run/.git/candidate-audit/issues.json \
  --mapping /private/tmp/transferred-issues.txt \
  /private/tmp/mistria-frozen-candidate
```

Mapped issues retain links to their new public numbers. Mapping is single-pass, so a destination
number is never interpreted again as an old number. Duplicate source or destination numbers,
nonpositive numbers, unknown source numbers, & PR mappings are rejected. Blank lines & comment lines
starting with `#` are allowed.

Cache the source issue/PR export **before the repository rename**; otherwise `gh` may query the new
repository under the old name. Reuse `issues.json` with `--issues` after the rename. Refresh it
before freezing if more issues or PRs were created:

```bash
gh api 'repos/mrh-is/mistria-fyi/issues?state=all&per_page=100' \
  --paginate --slurp > /private/tmp/private-issues.json
```

## Required audits

The script fails unless all of these checks pass:

1. No reachable path is under `static/sprites/` or has the basename `measure-transfer-size.ts`. Both
   `rev-list --objects --all` & every distinct historical tree are checked, so shared blobs cannot
   hide an excluded path behind a retained path.
2. The macOS home-directory prefix is absent from text across every candidate commit.
3. The candidate tip’s tree hash equals a separately computed source tree after applying only the
   URL reference rewrites, preserving file names, modes, symlinks, & gitlinks.
4. Only `refs/heads/main` exists, & no remote remains.
5. Candidate messages have no known private issue/PR reference unless its number is an allowed
   mapped public destination.
6. `gitleaks git --log-opts=--all` reports no secrets with the candidate-specific configuration.
7. The script prints the commit count & `git count-objects -vH` size for human inspection.

The size has no arbitrary pass threshold; compare it with the source & investigate unexpected
growth. Git commit IDs change during filtering. GitHub-held refs in the private source are never
rewritten, which is why publication uses a new repository.

The scanner keeps every default detector. The first unconfigured dry run reported 13 false
positives, each verified against its historical source: 12 game item/animal IDs, & the literal
localStorage key `mistria-fyi-v1-quarantine` in a persistence test. The configuration exempts only
those exact identifiers in their exact files from `generic-api-key`. It does not exclude entire
files, commits, or detectors; a different token in the same file remains detectable. This uses
[Gitleaks’ rule-specific allowlists](https://github.com/gitleaks/gitleaks#configuration) with an
`AND` condition between path & identifier. Review any new finding rather than widening an exception
automatically.

## Regression checks

Before publishing a candidate, verify its rewritten tip as well as the source branch. URL rewrites
apply throughout text files, including source code & test fixtures; source-branch CI alone does not
verify that the candidate still lints, type-checks, tests, & builds. With the repository’s Node 24 &
pinned pnpm, run:

```bash
cd /private/tmp/mistria-frozen-candidate
pnpm install --frozen-lockfile
pnpm run verify
git diff --exit-code
```

Save the verification output alongside the candidate’s audit reports. Verification must exit zero &
leave the tracked tip unchanged before publication. Do not run `lint:fix` or edit tracked files in
the candidate: fix a failure in the source or rewrite procedure, then rebuild & rerun the audits.
Asset-dependent checks remain separate; the standard matrix needs no game files.

For the rewrite procedure itself, run:

```bash
pnpm exec vitest run scripts/public-repo/build-candidate.test.ts
shellcheck scripts/public-repo/build-candidate.sh
```

The fixture that exercises real filtering & secret scanning runs when both tools are installed; the
remaining reference & rejection tests also run in CI without those tools.
