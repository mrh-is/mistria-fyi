#!/usr/bin/env bash
# Prepare a fresh Claude Code or Codex cloud checkout for this repository.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
node_version=$(tr -d '[:space:]' <"$repo_root/.node-version")

if [[ ! "$node_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: .node-version must contain a full semantic version" >&2
  exit 1
fi

if [ "$(uname -s)" != "Linux" ]; then
  echo "error: cloud setup supports Linux environments only" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64 | arm64) node_arch=arm64 ;;
  *)
    echo "error: unsupported cloud architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

install_root="$HOME/.local/share/mistria-node"
install_dir="$install_root/$node_version"
node_archive="node-v${node_version}-linux-${node_arch}.tar.xz"

if [ ! -x "$install_dir/bin/node" ]; then
  if [ -e "$install_dir" ]; then
    echo "error: incomplete Node installation at $install_dir; remove it and retry" >&2
    exit 1
  fi

  tmp_dir=$(mktemp -d)
  trap 'rm -rf "$tmp_dir"' EXIT
  node_base_url="https://nodejs.org/dist/v${node_version}"

  curl --fail --location --retry 3 --silent --show-error \
    --output "$tmp_dir/$node_archive" "$node_base_url/$node_archive"
  curl --fail --location --retry 3 --silent --show-error \
    --output "$tmp_dir/SHASUMS256.txt" "$node_base_url/SHASUMS256.txt"

  (
    cd "$tmp_dir"
    grep "  $node_archive\$" SHASUMS256.txt | sha256sum --check --strict
    tar --extract --file "$node_archive"
  )

  mkdir -p "$install_root"
  mv "$tmp_dir/node-v${node_version}-linux-${node_arch}" "$install_dir"
fi

ln -sfn "$install_dir" "$install_root/current"

# Codex reconstructs PATH for the agent phase from its configured runtime after this script exits.
# When that runtime is older than the repository's version, keep its PATH entry valid but point its
# Node executable at the verified installation above. The original executable remains available for
# troubleshooting and a cache reset restores the platform runtime completely.
if [ -n "${CODEX_ENV_NODE_VERSION:-}" ]; then
  platform_node=$(command -v node)
  case "$platform_node" in
    "$HOME/.nvm/versions/node/"*/bin/node)
      if [ ! "$platform_node" -ef "$install_dir/bin/node" ]; then
        platform_node_backup="$platform_node.codex-platform"
        if [ ! -e "$platform_node_backup" ]; then
          mv "$platform_node" "$platform_node_backup"
        else
          rm "$platform_node"
        fi
        ln -s "$install_dir/bin/node" "$platform_node"
      fi
      ;;
    *)
      echo "error: Codex selected an unexpected Node executable: $platform_node" >&2
      exit 1
      ;;
  esac
fi

cloud_node_path='$HOME/.local/share/mistria-node/current/bin'
path_line="export PATH=\"$cloud_node_path:\$PATH\""

# Codex starts the agent phase in a fresh login shell. Bash reads .bash_profile for that shell and
# does not fall back to .profile when .bash_profile exists. Persist the path in all common Bash
# startup files so the downloaded runtime wins over the platform-selected Node after setup exits.
for startup_file in "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.bashrc"; do
  touch "$startup_file"
  grep -Fqx "$path_line" "$startup_file" || printf '\n%s\n' "$path_line" >>"$startup_file"
done
export PATH="$install_root/current/bin:$PATH"

if [ "$(node --version)" != "v$node_version" ]; then
  echo "error: expected Node v$node_version, found $(node --version)" >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm is not installed in this cloud image" >&2
  exit 1
fi

cd "$repo_root"
pnpm install --frozen-lockfile
