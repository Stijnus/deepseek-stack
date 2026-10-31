#!/usr/bin/env bash
# build.sh — produce skills/ from pristine upstream + the reviewable optimization patch.
#
#   ./tools/build.sh               build into a temp tree, validate it, then swap skills/ in
#   ./tools/build.sh --pull        git-pull upstream first, then build
#   ./tools/build.sh --regen-patch after a hand edit, capture skills/ back into optimize.patch
#
# Design notes, both learned the hard way:
#  * The build never touches skills/ until the patched tree has validated. An earlier version did
#    `rm -rf skills` first; a conflicting patch then left a pristine upstream tree that validates
#    clean and would install silently. Now a failed build leaves the previous good tree alone.
#  * `patch`, not `git apply`: inside a git work tree git apply resolves paths against the
#    REPOSITORY ROOT, prints "Skipped patch" for every file it cannot find there, and exits 0.
#    This tree lives inside a repo, so git apply would silently do nothing.
#  * Aliases live in aliases/ and are installed directly by install.mjs. They are deliberately
#    NOT staged into skills/, so the diff below can never pick them up.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
upstream="$here/upstream/deepseek-stack"
target="$here/skills"
patchfile="$here/tools/optimize.patch"

[[ -d "$upstream/skills" ]] || { echo "no upstream tree at $upstream/skills" >&2; exit 1; }
[[ -f "$patchfile" ]] || { echo "no patch at $patchfile" >&2; exit 1; }

if [[ "${1:-}" == "--pull" ]]; then
  if [[ -d "$upstream/.git" ]]; then
    echo "pulling $upstream"
    git -C "$upstream" pull --ff-only
  else
    echo "upstream is not a git checkout; skipping pull (re-vendor aicodeking/deepseek-stack)" >&2
  fi
fi

# --- regenerate the patch from the working tree ------------------------------------------------
if [[ "${1:-}" == "--regen-patch" ]]; then
  shopt -s nullglob
  strays=("$target"/*.md)
  shopt -u nullglob
  if (( ${#strays[@]} )); then
    echo "refusing: flat files in skills/ belong in aliases/:" >&2
    printf '  %s\n' "${strays[@]}" >&2
    exit 1
  fi
  echo "regenerating $patchfile from skills/"
  ( cd "$here" && git diff --no-index upstream/deepseek-stack/skills skills ) > "$here/tools/.raw.patch" || true
  sed -e 's|^--- a/upstream/deepseek-stack/skills/|--- a/skills/|' \
      -e 's|^diff --git a/upstream/deepseek-stack/skills/|diff --git a/skills/|' \
      "$here/tools/.raw.patch" > "$patchfile"
  rm -f "$here/tools/.raw.patch"
  echo "wrote $patchfile ($(grep -c '^diff --git' "$patchfile" || true) files)"
  echo "next: ./tools/build.sh   (verifies the patch still applies)"
  exit 0
fi

# --- build into a temp tree, validate, then swap ------------------------------------------------
tmp="$here/.build.$$"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

rm -rf "$tmp"; mkdir -p "$tmp"
cp -R "$upstream/skills" "$tmp/skills"

echo "applying $(basename "$patchfile")"
if ! ( cd "$tmp" && patch -p1 --forward --no-backup-if-mismatch -i "$patchfile" >/dev/null ); then
  cat >&2 <<'EOF'

PATCH DOES NOT APPLY CLEANLY. skills/ was left untouched.

Upstream changed under the patch. Re-read docs/OPTIMIZATION-SPEC.md, redo the conflicting
skills against the new upstream text, then regenerate:
  ./tools/build.sh --regen-patch
EOF
  exit 1
fi

echo "validating the built tree"
if ! node "$here/tools/validate.mjs" "$tmp/skills" --aliases "$here/aliases" --upstream "$upstream/skills"; then
  echo "" >&2
  echo "BUILD FAILED VALIDATION. skills/ was left untouched." >&2
  exit 1
fi

echo ""
echo "swapping skills/ into place"
rm -rf "$target"
mv "$tmp/skills" "$target"
rm -rf "$tmp"

node "$here/tools/stamp.mjs" write
echo ""
echo "done. next: node tools/install.mjs"
