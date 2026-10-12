#!/usr/bin/env bash
# Build an offline public candidate. Never modifies the source repository or pushes anything.
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }
usage() {
  echo "Usage: $0 [--source COMMIT] [--mapping FILE] [--issues FILE] OUTPUT_DIRECTORY" >&2
  exit 1
}

source_ref=origin/main
mapping_file=
issues_file=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source|--mapping|--issues)
      [[ $# -ge 2 ]] || usage
      case "$1" in
        --source) source_ref=$2 ;;
        --mapping) mapping_file=$2 ;;
        --issues) issues_file=$2 ;;
      esac
      shift 2
      ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done
[[ $# -eq 1 ]] || usage

command -v git >/dev/null 2>&1 || die "git is missing; install Git."
# Windows often has only `python` or the `py` launcher; its `python3` is usually the Microsoft Store
# alias, which prints an install hint instead of running.
python=()
for candidate in python3 python "py -3"; do
  read -ra command <<<"$candidate"
  if "${command[@]}" -c 'import sys; sys.exit(sys.version_info < (3, 8))' >/dev/null 2>&1; then
    python=("${command[@]}")
    break
  fi
done
[[ -n ${python[0]:-} ]] || die "Python 3 is missing; install it (Windows: winget install Python.Python.3.13)."
# Resolve through Python so paths it later reads from the environment are native on Windows, where
# Git Bash's `/c/…` paths mean nothing to Python. Forward slashes keep `dirname` & prefix checks
# working, & writing without a newline avoids a trailing `\r` from Windows text-mode stdout.
native_path() {
  "${python[@]}" -c 'import os, sys; sys.stdout.write(os.path.realpath(sys.argv[1]).replace(os.sep, "/"))' "$1"
}

script_dir=$(native_path "$(dirname -- "${BASH_SOURCE[0]}")")
source_repo=$(native_path "$(git rev-parse --show-toplevel)")
source_commit=$(git rev-parse --verify "${source_ref}^{commit}")
main_ref=main
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  main_ref=origin/main
fi
git merge-base --is-ancestor "$source_commit" "$main_ref" || die "$source_ref is not a main commit."

# Validate before creating output, so a rejected tip cannot be mistaken for a candidate.
for excluded in static/sprites/ scripts/measure-transfer-size.ts; do
  if [[ -n $(git ls-tree --name-only "$source_commit" -- "${excluded%/}") ]]; then
    die "source tip contains $excluded; only history may be stripped."
  fi
done

output_dir=$(native_path "$1")
[[ ! -e "$1" && ! -L "$1" && ! -e "$output_dir" ]] || die "output directory already exists: $1"
case "$output_dir/" in
  "$source_repo/"*) die "output directory must be outside this checkout: $output_dir" ;;
esac
[[ -d $(dirname -- "$output_dir") ]] || die "output parent directory does not exist."
for tool in git-filter-repo gitleaks; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is missing; see docs/public-repo.md#build--inspect to install it."
done
if [[ -n "$mapping_file" ]]; then
  mapping_file=$(native_path "$mapping_file")
  [[ -f "$mapping_file" ]] || die "mapping file not found: $mapping_file"
fi
if [[ -n "$issues_file" ]]; then
  issues_file=$(native_path "$issues_file")
  [[ -f "$issues_file" ]] || die "issue export not found: $issues_file"
else
  command -v gh >/dev/null 2>&1 || die "gh is required without --issues; install GitHub CLI."
fi

git clone --no-local --single-branch --branch main --no-tags -- "$source_repo" "$output_dir"
# A maintainer’s local main can lag origin/main; fetch the resolved main commit without new refs.
git -C "$output_dir" fetch --no-tags -- "$source_repo" "$source_commit"
git -C "$output_dir" reset --hard "$source_commit"
while IFS= read -r ref; do
  [[ "$ref" = refs/heads/main ]] || git -C "$output_dir" update-ref -d "$ref"
done < <(git -C "$output_dir" for-each-ref --format='%(refname)')
git -C "$output_dir" remote remove origin

audit_dir="$output_dir/.git/candidate-audit"
mkdir -- "$audit_dir"
if [[ -n "$issues_file" ]]; then
  cp -- "$issues_file" "$audit_dir/issues.json"
else
  repo_name=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
  gh api "repos/$repo_name/issues?state=all&per_page=100" --paginate --slurp >"$audit_dir/issues.json"
fi
if [[ -n "$mapping_file" ]]; then
  cp -- "$mapping_file" "$audit_dir/mapping.txt"
else
  : >"$audit_dir/mapping.txt"
fi

export CANDIDATE_AUDIT_DIR="$audit_dir"
export CANDIDATE_REWRITER="$script_dir/rewrite-references.py"
export PYTHONDONTWRITEBYTECODE=1
"${python[@]}" "$CANDIDATE_REWRITER" prepare "$source_repo" "$source_commit"
# Initialize once per callback namespace; both append to the same rewrite report.
bootstrap='global candidate_rewriter
if "candidate_rewriter" not in globals():
    import importlib.util, os
    spec = importlib.util.spec_from_file_location("candidate_references", os.environ["CANDIDATE_REWRITER"])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    candidate_rewriter = module.callback_rewriter()'
message_callback="$bootstrap
return candidate_rewriter.message(message)"
blob_callback="$bootstrap
blob.data = candidate_rewriter.blob(blob.data, blob.original_id)"
git -C "$output_dir" filter-repo --force \
  --path static/sprites/ --path scripts/measure-transfer-size.ts --invert-paths \
  --message-callback "$message_callback" --blob-callback "$blob_callback" \
  --preserve-commit-hashes
git -C "$output_dir" reflog expire --expire=now --all
git -C "$output_dir" gc --prune=now --aggressive

"${python[@]}" "$CANDIDATE_REWRITER" audit "$source_repo" "$source_commit" "$output_dir"
cp -- "$script_dir/gitleaks.toml" "$audit_dir/gitleaks.toml"
gitleaks git "$output_dir" --config "$audit_dir/gitleaks.toml" --log-opts=--all \
  --redact --report-format json --report-path "$audit_dir/gitleaks.json"
echo "PASS: gitleaks found no secrets."
{
  echo "PASS: gitleaks found no secrets."
  echo "Source commit: $source_commit"
  echo "Candidate commit: $(git -C "$output_dir" rev-parse main)"
  echo "Commit count: $(git -C "$output_dir" rev-list --count main)"
  git -C "$output_dir" count-objects -vH
} | tee -a "$audit_dir/summary.txt"
echo "Candidate & audit reports: $output_dir"
