#!/usr/bin/env bash
# selftest.sh — the non-destructive gates that keep a bad pack from shipping.
#
# Every check here exists because one of them failed for real:
#   gate 2  an alias whose target was renamed still validated clean
#   gate 3  the installed root was never checked at all — only the build output was
#   gate 4  a hand edit could drift skills/ away from the reviewable patch
#   gate 5  uninstall deleted by name alone, so a file edited after install was destroyed
#   gate 6  the installed-root check passed on a root that had drifted from the repo
#   gate 7  an alias target was inferred from prose, so an earlier mention changed what it pointed at
#
# The only tree these gates mutate is a throwaway temp target; the real install is untouched.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"
fail=0
step() { printf '\n== %s\n' "$1"; }
bad() { echo "   FAILED: $*"; fail=1; }

step "gate 1: skills/ is the output of a successful build"
node tools/stamp.mjs verify || bad "build stamp"

step "gate 2: source contract (bundles + aliases, cross-root)"
if [[ -d upstream/deepseek-stack/skills ]]; then
  node tools/validate.mjs skills --aliases aliases --expect-aliases 6 --upstream upstream/deepseek-stack/skills || bad "source contract"
else
  echo "   (upstream not fetched — body-preservation comparison skipped; run ./tools/fetch-upstream.sh)"
  node tools/validate.mjs skills --aliases aliases --expect-aliases 6 || bad "source contract"
fi

step "gate 3: the installed root DSH actually reads"
if [[ -d "$HOME/.agents/skills" ]]; then
  node tools/validate.mjs "$HOME/.agents/skills" --prefix ds- || bad "installed root contract"
  # Contract-clean is not the same as current: a stale alias or an in-place edit still validates.
  node tools/install.mjs --verify-install || bad "installed root drifted from this repo — run node tools/install.mjs"
else
  echo "   skipped (nothing installed)"
fi

step "gate 4: the patch fully explains skills/ (rebuild determinism)"
if [[ -d upstream/deepseek-stack/skills ]]; then
  tmp="$(mktemp -d)"
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
  rm -rf "$tmp"
else
  echo "   skipped (upstream not fetched — run ./tools/fetch-upstream.sh)"
fi

step "gate 5: uninstall refuses a file that changed since install"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if node tools/install.mjs --target "$tmp/skills" >/dev/null 2>&1; then
  printf '\n<!-- edited after install -->\n' >> "$tmp/skills/ds-plan.md"
  if node tools/install.mjs --uninstall --target "$tmp/skills" >/dev/null 2>&1; then
    bad "uninstall exited 0 even though a file changed since install"
  fi
  if [[ ! -f "$tmp/skills/ds-plan.md" ]]; then
    bad "uninstall deleted a modified alias despite the sha256 mismatch"
  elif [[ -d "$tmp/skills/ds-tdd" ]]; then
    bad "uninstall kept an unmodified skill"
  else
    echo "   modified alias kept, unmodified entries removed, exit non-zero"
  fi
  if node tools/install.mjs --uninstall --force --target "$tmp/skills" >/dev/null 2>&1 && [[ ! -f "$tmp/skills/ds-plan.md" ]]; then
    echo "   --force removes what it could not verify"
  else
    bad "--force did not clear the kept entry"
  fi
else
  bad "install into a scratch target failed, so the uninstall check could not run"
fi

step "gate 6: the drift detector catches a changed install"
tmp="$(mktemp -d)"
if node tools/install.mjs --target "$tmp/skills" >/dev/null 2>&1; then
  if node tools/install.mjs --verify-install --target "$tmp/skills" >/dev/null 2>&1; then
    echo "   clean install verifies as byte-identical"
  else
    bad "verify-install rejected a clean install"
  fi
  printf '\n<!-- edited after install -->\n' >> "$tmp/skills/ds-plan.md"
  if node tools/install.mjs --verify-install --target "$tmp/skills" >/dev/null 2>&1; then
    bad "drift detector missed an edited file"
  else
    echo "   edited file reported as drift, exit non-zero"
  fi
else
  bad "scratch install failed, so the drift detector could not be tested"
fi
rm -rf "$tmp"

step "gate 7: alias targets are declared, not inferred"
tmp="$(mktemp -d)"
cp -R aliases "$tmp/aliases"
undeclared=$(grep -L 'aliasOf:' "$tmp"/aliases/*.md 2>/dev/null | wc -l | tr -d ' ')
if [[ "$undeclared" != 0 ]]; then
  bad "$undeclared alias file(s) do not declare metadata.aliasOf"
else
  echo "   all aliases declare metadata.aliasOf"
fi
python3 - "$tmp/aliases/ds-plan.md" <<'PYEOF'
import sys
p = sys.argv[1]
s = open(p).read()
open(p, 'w').write(s.replace("Alias for `ds-plan-loop`. Load that skill",
                             "Start from `ds-principles`, then follow `ds-plan-loop`. Load that skill"))
PYEOF
if node tools/validate.mjs skills --aliases "$tmp/aliases" --expect-aliases 6 >/dev/null 2>&1; then
  echo "   an earlier prose mention does not override the declared target"
else
  bad "a body mention overrode the declared alias target"
fi
python3 - "$tmp/aliases/ds-plan.md" <<'PYEOF'
import sys
p = sys.argv[1]
s = open(p).read()
open(p, 'w').write(s.replace('aliasOf: ds-plan-loop', 'aliasOf: ds-nopeals'))
PYEOF
if node tools/validate.mjs skills --aliases "$tmp/aliases" --expect-aliases 6 >/dev/null 2>&1; then
  bad "validator accepted an alias whose declared target does not exist"
else
  echo "   a declared target that does not exist is rejected"
fi
rm -rf "$tmp"

printf '\n'
if (( fail )); then echo "SELFTEST FAILED"; exit 1; fi
echo "SELFTEST PASSED"
