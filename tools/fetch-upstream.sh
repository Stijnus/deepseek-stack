#!/usr/bin/env bash
# fetch-upstream.sh — materialise the pristine upstream tree that build.sh diffs against.
#
# upstream/ is deliberately NOT committed: this repository is a fork, so the fork's git history
# already carries the baseline, and vendoring a second copy inside itself would be duplication
# that silently drifts. Instead the base commit is pinned in UPSTREAM-COMMIT and fetched here.
#
# After this runs:
#   upstream/deepseek-stack/        pristine aicodeking/deepseek-stack at the pin (with .git)
#   upstream/deepseek-stack/COMMIT  the resolved commit, which install.mjs/stamp.mjs read
#
# Usage: ./tools/fetch-upstream.sh [--unshallow]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$here/upstream/deepseek-stack"
pin_file="$here/UPSTREAM-COMMIT"
upstream_url="${UPSTREAM_URL:-https://github.com/aicodeking/deepseek-stack.git}"

[[ -f "$pin_file" ]] || { echo "missing $pin_file" >&2; exit 1; }
pin="$(tr -d '[:space:]' < "$pin_file")"
[[ -n "$pin" ]] || { echo "empty pin in $pin_file" >&2; exit 1; }

mkdir -p "$here/upstream"

if [[ -d "$dest/.git" ]]; then
  echo "updating existing checkout at $dest"
  git -C "$dest" fetch --quiet origin
  git -C "$dest" checkout --quiet "$pin"
else
  echo "cloning $upstream_url"
  rm -rf "$dest"
  git clone --quiet "$upstream_url" "$dest"
  git -C "$dest" checkout --quiet "$pin"
fi

resolved="$(git -C "$dest" rev-parse HEAD)"
if [[ "$resolved" != "$pin" ]]; then
  echo "expected $pin, got $resolved" >&2
  exit 1
fi

printf '%s\n' "$resolved" > "$dest/COMMIT"
echo "upstream pinned at $resolved ($(git -C "$dest" log -1 --format='%h %s'))"
echo "next: ./tools/build.sh"
