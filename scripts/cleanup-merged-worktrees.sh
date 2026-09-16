#!/usr/bin/env bash

# Remove only local branches whose exact tip was merged through GitHub, together with any clean
# worktree that checks out one of those branches. Run without arguments to preview the changes.

set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/cleanup-merged-worktrees.sh [--apply]

Preview or remove local branches whose current commit exactly matches the head commit of a merged
GitHub pull request. When such a branch has an associated worktree, the script removes that
worktree first, but only when it is clean and unlocked.

Without --apply, the script only reports what it would remove. It never removes branches with an
open pull request, branches with local commits after the merged pull request, dirty worktrees, or
worktrees that Git refuses to remove.
EOF
}

apply=false

case "${1:-}" in
	"") ;;
	--apply) apply=true ;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		usage >&2
		exit 2
		;;
esac

if ! command -v gh >/dev/null; then
	printf 'gh is required to confirm pull-request merge status.\n' >&2
	exit 1
fi

repository_root=$(git rev-parse --show-toplevel)
cd "$repository_root"
current_branch=$(git branch --show-current)
default_branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
default_branch=${default_branch#origin/}

worktree_for_branch() {
	local target_branch=$1
	local worktree_path=
	local worktree_branch=

	while IFS= read -r line; do
		case "$line" in
		worktree\ *) worktree_path=${line#worktree } ;;
		branch\ refs/heads/*)
			worktree_branch=${line#branch refs/heads/}
			if [[ $worktree_branch == "$target_branch" ]]; then
				printf '%s\n' "$worktree_path"
				return 0
			fi
			;;
		esac
	done < <(git worktree list --porcelain)
}

for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
	if [[ $branch == "$current_branch" ]]; then
		printf 'Skipping current branch: %s\n' "$branch"
		continue
	fi
	if [[ -n $default_branch ]] && [[ $branch == "$default_branch" ]]; then
		printf 'Skipping default branch: %s\n' "$branch"
		continue
	fi

	head_oid=$(git rev-parse "$branch")
	if ! merged_pr=$(gh pr list --head "$branch" --state merged --limit 100 --json number,headRefOid --jq ".[] | select(.headRefOid == \"$head_oid\") | .number" 2>/dev/null); then
		printf 'Skipping %s: GitHub could not confirm its merge status.\n' "$branch" >&2
		continue
	fi

	if [[ -z $merged_pr ]]; then
		printf 'Keeping %s: its current commit has no merged pull request.\n' "$branch"
		continue
	fi

	if ! open_pr=$(gh pr list --head "$branch" --state open --limit 1 --json number --jq '.[].number' 2>/dev/null); then
		printf 'Skipping %s: GitHub could not confirm whether it has an open pull request.\n' "$branch" >&2
		continue
	fi

	if [[ -n $open_pr ]]; then
		printf 'Keeping %s: it has open pull request #%s.\n' "$branch" "$open_pr"
		continue
	fi

	worktree_path=$(worktree_for_branch "$branch" || true)
	if [[ -n $worktree_path ]] && [[ -n $(git -C "$worktree_path" status --porcelain) ]]; then
		printf 'Keeping %s: worktree %s has uncommitted changes.\n' "$branch" "$worktree_path"
		continue
	fi

	if [[ $apply == false ]]; then
		if [[ -n $worktree_path ]]; then
			printf 'Would remove worktree %s and branch %s (merged PR #%s).\n' "$worktree_path" "$branch" "$merged_pr"
		else
			printf 'Would delete branch %s (merged PR #%s).\n' "$branch" "$merged_pr"
		fi
		continue
	fi

	if [[ -n $worktree_path ]]; then
		if ! git worktree remove "$worktree_path"; then
			printf 'Keeping %s: Git refused to remove worktree %s.\n' "$branch" "$worktree_path" >&2
			continue
		fi
	fi

	git branch -D "$branch"
	printf 'Removed branch %s (merged PR #%s).\n' "$branch" "$merged_pr"
done
