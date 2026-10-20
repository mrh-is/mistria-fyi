# Squash merge only

## Context

`main` accepted merge commits only, a setting carried over unexamined from the private repository at
the public cutover. Agent branches routinely contain WIP commits & “merge origin/main” commits, so
every merge landed that history on `main`: a tangled graph, `git bisect` stepping through commits
that never ran CI alone, and multi-commit reverts. Work is scoped one issue to one PR, so the PR is
already the meaningful unit of change.

## Decision

Pull requests merge by squash only. Merge commits & rebase merging are disabled in the repository
settings, so tooling enforces this rather than prose. The squash commit takes the PR title (GitHub
appends the PR number) and the concatenated branch commit messages as its body, which keeps each
commit’s `Co-Authored-By` trailer on `main`.

The “Attribution” check is unaffected: it validates a PR’s own commits before merge, never `main`.

## Alternatives

- **Keep merge commits.** Rejected: it preserves original SHAs & signatures, but those buy little
  when branch commits are WIP, and the merge-main-into-branch commits make `main` hard to read.
- **Rebase merging.** Rejected: it rewrites every SHA, drops local signatures, and lands each
  unbuilt WIP commit on `main` individually, which is worse for bisect than either alternative.
- **Squash with the PR body as the commit message.** Rejected for now: the body ends with `Agent:`
  rather than the commit trailers, so agent co-authorship would vanish from `main`.

## Revisit if

- PRs start stacking on one another routinely, since squashing forces each child branch to rebase
  with `--onto`.
- Contributors curate atomic, individually tested commits and want them preserved on `main`.
- A check or release tool starts reading attribution or metadata from `main`’s history rather than
  from the PR.
