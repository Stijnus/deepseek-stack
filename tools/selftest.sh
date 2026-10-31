#!/usr/bin/env bash
# selftest.sh — the non-destructive gates that keep a bad pack from shipping.
#
# Every check here exists because one of them failed for real:
#   gate 2  an alias whose target was renamed still validated clean
#   gate 3  the installed root was never checked at all — only the build output was
#   gate 4  a hand edit could drift skills/ away from the reviewable patch
#
# Destructive scenarios (patch conflict must not destroy skills/, a deleted alias must be removed
# on reinstall) are verified by hand and recorded in PLAN.md; they mutate the tree, so they are
# not in a script a reader is invited to run casually.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"
fail=0
step() { printf '\n== %s\n' "$1"; }
bad() { echo "   FAILED: $*"; fail=1; }

step "gate 1: skills/ is the output of a successful build"
node tools/stamp.mjs verify || bad "build stamp"

step "gate 2: source contract (bundles + aliases, cross-root)"
node tools/validate.mjs skills --aliases aliases --expect-aliases 6 --upstream upstream/deepseek-stack/skills || bad "source contract"

step "gate 3: the installed root DSH actually reads"
if [[ -d "$HOME/.agents/skills" ]]; then
  node tools/validate.mjs "$HOME/.agents/skills" --prefix ds- || bad "installed root contract"
else
  echo "   skipped (nothing installed)"
fi

step "gate 4: the patch fully explains skills/ (rebuild determinism)"
if [[ ! -d upstream/deepseek-stack/skills ]]; then
  echo "   skipped (upstream not fetched — run ./tools/fetch-upstream.sh)"
  printf '\n'
  if (( fail )); then echo "SELFTEST FAILED"; exit 1; fi
  echo "SELFTEST PASSED (gate 4 skipped)"
  exit 0
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R upstream/deepseek-stack/skills "$tmp/skills"
if ( cd "$tmp" && patch -p1 --forward -i "$here/tools/optimize.patch" >/dev/null 2>&1 ); then
  if diff -r "$tmp/skills" skills >/dev/null 2>&1; then
    echo "   rebuilt tree is byte-identical to skills/"
  else
    bad "skills/ differs from upstream+patch — run ./tools/build.sh --regen-patch"
  fi
else
  bad "patch does not apply to upstream"
fi

printf '\n'
if (( fail )); then echo "SELFTEST FAILED"; exit 1; fi
echo "SELFTEST PASSED"
