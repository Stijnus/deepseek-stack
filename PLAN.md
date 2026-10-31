# PLAN — gesture aliases for the ds-* pack

## Goal

Make the pack answer the short skill names users actually type — `/ds-plan`, `/ds-verify` — at
zero additional catalog cost.

## Context (verified before planning, not assumed)

- `tool-skill:945` builds the model catalog from `.filter(isModelInvocable)`, and
  `filesystem-provider:860` defaults `userInvocable: userInvocable !== false`.
  → A flat skill with `disable-model-invocation: true` is reachable by the `/name` gesture
  (`tool-skill:911`, which filters on `isUserInvocable`) and **invisible** to the catalog.
- The `/name` gesture requires an exact whitespace-bounded token equal to a skill name.
  `/ds-plan` therefore does nothing today: the skill is `ds-plan-loop`.
- `validate.mjs:85` already discovers flat `<name>.md`.
- `install.mjs:90` filters `isDirectory()` → flat files would be skipped.
- `build.sh:32` does `rm -rf skills` then copies upstream → alias files staged in `skills/`
  would be deleted on every rebuild.

## Steps

1. **Add `aliases/`** with 6 flat skill files: `ds-plan`, `ds-verify`, `ds-review`,
   `ds-context`, `ds-best`, `ds-audit`. Each has `name`, a one-line `description`, and
   `disable-model-invocation: true`; body is a 3-line pointer to the real skill.
   *Check:* `ls aliases/*.md | wc -l` = 6, and every file contains
   `disable-model-invocation: true`.

2. **Validator:** exempt `disable-model-invocation: true` skills from the description-length
   budget (they are never rendered, so the budget does not apply).
   *Check:* `node tools/validate.mjs aliases` → `0 FAIL | 0 WARN`.

3. **build.sh:** stage `aliases/*.md` into `skills/` after the patch applies, so a rebuild keeps
   them.
   *Check:* `./tools/build.sh` → validator clean, and `ls skills/*.md | wc -l` = 6.

4. **install.mjs:** also install flat `.md` files, record them in the manifest, and remove them
   on `--uninstall`.
   *Check:* `node tools/install.mjs --dry-run` lists 29 directories **and** 6 alias files.

5. **Docs:** add an alias table and the "names match exactly" rule to `USAGE.md`.
   *Check:* `grep -c '^| `/ds-' USAGE.md` = 6.

6. **Install and prove zero catalog growth.**
   *Check:* `ls ~/.agents/skills/*.md | wc -l` = 6; the model-visible catalog still lists
   exactly 29 `ds-*` entries and `validate.mjs` still reports catalog 5,497 chars.

## Not doing

- No aliases for names that are already short (`ds-ship`, `ds-pr`, `ds-tdd`, `ds-mode`, ...).
- No change to the 29 real skills or to `tools/optimize.patch`.
- No aliasing of someone else's skills.

---

## Result

Executed in order. Each check is the command from the plan, run against the real tree.

| # | Step | Check run | Result |
|---|---|---|---|
| 1 | `aliases/` with 6 files | `ls aliases/*.md \| wc -l` | 6 files, 6 with `disable-model-invocation: true` |
| 2 | Validator exempts hidden skills | `node tools/validate.mjs aliases` | `0 FAIL \| 0 WARN`; also fixed the alias line to report `0 chars` catalog cost |
| 3 | `build.sh` stages aliases | `./tools/build.sh` | `35 skills \| 0 FAIL \| 0 WARN \| catalog 5497` |
| 4 | `install.mjs` handles flat files | `node tools/install.mjs --dry-run` | `29 skill(s) + 6 alias(es)` |
| 5 | Docs | `grep -c '^| \`/ds-' USAGE.md` | 6 |
| 6 | Install, zero catalog growth | see below | 6 aliases + 29 dirs installed; catalog still 5,497 chars |

Step 6 evidence, three ways:
- `ls ~/.agents/skills/*.md | wc -l` = 6, `ls -d ~/.agents/skills/ds-*/` = 29.
- `validate.mjs` still reports `catalog 5497 chars … | 6 gesture-only (0 catalog cost)`.
- The install triggered **no catalog-replacement message** in the running session, while the
  first install (which changed membership) did. The digest did not change because
  `tool-skill:945` filtered the aliases out — the mechanism working as designed, observed
  rather than asserted.

## Plan deviations

- Steps 3 and 4 both touched `tools/`, but each had its own acceptance check and its own
  commit-sized diff, so "one step per diff" held.
- Two validator fixes were not in the original plan: the catalog-cost line counted hidden skills
  as visible (misleading), and the upstream-comparison warning treated local-only flat bundles
  as defects. Both were found *by* the step-2 and step-3 checks, which is the loop doing its job.

---

## Round 2 — the honest gaps

Verdict per gap, after diagnosing rather than assuming.

| Gap | Was it real? | Action |
|---|---|---|
| Fresh-pass critique returned nothing and the plan ran anyway | **Yes — worst gap.** It made an unverified plan look reviewed. | `ds-plan-loop` now says: "A review call that returns nothing — no critique and no error — is a failed step, not a pass. Re-run it once; if it is still empty, do the three answers yourself and write in the plan that you did." |
| `subagent` itself unreliable | **No.** A liveness probe returned exactly `SUBAGENT-OK 7`. The earlier miss was one silent no-result, not a broken capability. | No skill change needed; the rule above covers the silent case. |
| Executed step 1 while the critique was in flight | Process error, mine | Recorded here. The skill's own order (critique, revise, then execute) is correct; I raced it. |
| 3 upstream text defects documented but not fixed | **Yes.** "Documented" was a choice, not a fix. | Fixed `ds-tdd`, `ds-ledger`, `ds-pr` in `tools/optimize.patch`. |
| New risk introduced by the alias fix: rename a target skill, alias silently points nowhere | **Yes**, and it is the likeliest future break | `validate.mjs` now FAILs on an alias whose target is missing in the same root. Negative-tested by renaming `ds-plan-loop` → `ds-plan-loops`: `FAIL ds-plan alias points to missing skill "ds-plan-loop"`. |
| Skill edits would be wiped by the next build | **Yes**, caught while fixing the above | `tools/build.sh --regen-patch` captures hand edits into the patch; verified a clean rebuild reproduces the edited tree byte-for-byte. |

Still not fixed, deliberately: `/ds-name` matching is exact apart from the six aliases, because
DSH has no alias primitive — the alias files *are* the workaround, and every one costs a file.

---

## Round 3 — the plan-stage critique finally landed

The critique dispatched in Round 1 arrived late, after I had reported the gaps as closed. It was
worth waiting for: it found five real defects in my tooling. My earlier "done" was premature.
Verdicts below are per finding, checked against the code rather than accepted on trust.

| Finding | Verdict | Action |
|---|---|---|
| Reinstall never reconciles removals: delete an alias, reinstall, the old file keeps answering its gesture | **Confirmed** | `install.mjs` now removes manifest-owned entries that no longer exist in the repo, and reports them. Verified: deleting `aliases/ds-audit.md`, rebuilding and re-running `--dry-run` prints `would remove stale /Users/…/ds-audit.md`. Manifest schema also bumped to v2 (it gained `aliases` while still claiming v1). |
| `build.sh` destroyed `skills/` before the patch dry-run, so a conflicted build left a pristine upstream tree that validates clean and ships silently | **Confirmed, worst of the five** | The build now runs in a temp tree, validates it, and only then swaps `skills/` in. `tools/stamp.mjs` records digests of the patch, `skills/` and `aliases/` on success, and `install.mjs` refuses anything that does not match. Verified: a deliberately corrupt patch aborts with `skills/ was left untouched` and an unchanged digest; a tampered patch makes install refuse. |
| The installed root was never validated — the dangling-alias FAIL ran only on the source tree | **Confirmed** | Install now byte-compares what landed and runs `validate.mjs <target> --prefix ds-`. `tools/selftest.sh` gate 3 does the same on demand. Installed root: 0 FAIL, 0 WARN. |
| "Aliases are never rendered" is false: `dsh-client-ui-skill:429` renders non-model-invocable skills in the `/` menu with a `user-only` prefix, so alias descriptions are user-visible UI copy | **Confirmed** | The budget exemption is still right (no model-catalog tokens) but the stated reason was wrong. The comment and the docs now say: excluded from the *model* catalog, still shown in the `/` menu as user-only. |
| My `tool-skill:945` / `tool-skill:911` / `filesystem-provider:860` citations were "in a package not present" | **Rebutted.** The reviewer searched `.dsh-recon/`. All three packages are in `app.asar`, and re-extracting from the same archive reproduces those exact lines (911, 945, 860). `client-ui-skill:429` itself came from that extraction. Citations stand. | No change. |
| `validate.mjs` skipped the basename check for flat files, so `ds-plan.md` containing `name: ds-plan-loop` would install a second skill, kill `/ds-plan`, and validate green | **Confirmed** | Flat bundles must now have `name == filename`; the FAIL message explains why. Verified: it FAILs, and passes once restored. |
| Three layers for one idea (`aliases/` → staged into `skills/` → installed), including a move-out-and-back hack in `--regen-patch` | **Confirmed — adopted** | `install.mjs` now reads `aliases/` directly. `build.sh` no longer stages aliases, `--regen-patch` no longer moves files aside, and the patch is structurally incapable of containing aliases. This removed the double-counting that showed 12 gesture-only entries in Round 2. |

Net: 5 confirmed defects fixed, 1 claim rebutted with evidence, 1 simplification adopted. The
lesson is the same one the pack sells — "documented" is not "fixed", and my own `ds-plan-loop`
rule from Round 2 applies to review results too: a dispatched review that has not returned is
not a review that passed.

---

## Round 4 — collision fixes

Applied, HIGH first, per the request. Not a redesign: five descriptions grew a disambiguating
clause, one body gained an authority rule, two alias texts (free, user-visible only) name what
they are not.

| Step | Check | Result |
|---|---|---|
| Rewrite 5 descriptions within budget | char count each | 187 / 183 / 192 / 195 / 183 — all ≤ 200 |
| Regenerate patch | `--regen-patch` | 29 files, rebuild byte-identical (selftest gate 4) |
| Catalog cost | `validate.mjs` | 5,497 → 5,559 chars (+62, ≈17 tokens/session) |
| Install | post-install gates | 35 entries, installed == built, installed root contract-clean |
| Live effect | session catalog replacement | new `ds-review-loop`, `ds-jury`, `ds-design`, `ds-design-audit`, `ds-swarm` text present; the 6 aliases still absent from the model catalog |

Chosen trade: the HIGH cluster could have been resolved by renaming `ds-review-loop`, which costs
nothing per session but breaks every existing reference to it. Paying +9 chars to keep the name was
the cheaper side of that trade.
