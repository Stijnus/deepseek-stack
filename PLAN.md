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
| `build.sh` destroyed `skills/` before the patch dry-run, so a conflicted build left a pristine upstream tree that validates clean and ships silently | **Confirmed, worst of the five** | The build now runs in a temp tree, validates it, and only then swaps `skills/` in. `tools/stamp.mjs` records digests of the patch and `skills/` on success (aliases were later decoupled — see Round 8), and `install.mjs` refuses anything that does not match. Verified: a deliberately corrupt patch aborts with `skills/ was left untouched` and an unchanged digest; a tampered patch makes install refuse. |
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

---

## Round 5 — uninstall verifies sha256

Open item 1. `install.mjs --uninstall` used to delete every manifest-owned name outright, so a
skill or alias edited after install was destroyed without a word. It now hashes first.

| Case | Behaviour |
|---|---|
| hash matches the manifest | removed |
| hash differs | **kept**, reported, uninstall exits non-zero; manifest entry retained so `--force` can find it |
| no recorded hash (older manifest) | kept, same rule |
| file already absent | reported as already gone, entry dropped from the manifest |
| `--force` | deletes regardless — the deliberate override |

Skills are verified by their recorded `SKILL.md` digest, aliases by their file digest.

Checked end to end on a scratch target: clean uninstall removed 35/35 and exited 0; after appending
a line to `ds-plan.md` and `ds-ship/SKILL.md`, uninstall removed 33, kept 2, exited 1, and both
edited files were still present; the manifest retained exactly `ds-ship` and `ds-plan`; `--force`
then cleared them. `tools/selftest.sh` gained **gate 5** to keep this from regressing.

---

## Round 6 — gate 3 diffs the installed root against the repo

Open item 3. `selftest` gate 3 only ran the contract validator over `~/.agents/skills`. That proves
the installed root is *well-formed*, not that it is *current*: a stale alias the repo had dropped,
or a skill edited in place, still validated clean.

New read-only mode, `install.mjs --verify-install`, compares content byte-for-byte using the
manifest for ownership and reports three classes:

| Class | Meaning |
|---|---|
| `missing` | in this repo, not installed |
| `differs` | installed content changed (edit, different pack, partial copy) |
| `stale` | manifest-owned and installed, but no longer produced by this repo |

Gate 3 now runs the contract check **and** the drift check. Gate 6 was added to test the detector
itself (clean scratch install verifies; an edited file is reported and exits non-zero).

Verified on scratch targets: clean install → `29 skill(s) + 6 alias(es) byte-identical`; editing
`ds-plan.md` → `differs`; deleting `ds-tdd/` → `missing`; a manifest-owned `ds-ghost.md` the repo
does not produce → `stale`; file count unchanged by the check, so it is read-only.

---

## Round 7 — gate 2 stopped emitting 29 WARNs on a fresh clone

Found by actually running `./tools/selftest.sh` as `ds-verify-loop` asked, in the published clone
where `upstream/` is fetched on demand. Gate 2 passed `--upstream` unconditionally, so a tree without
upstream produced one `no upstream counterpart to compare` warning per skill — 29 lines of noise on
a perfectly clean run.

That is a defect even though the exit code was 0: a gate that cries wolf 29 times per run teaches
the reader to skim, which is how the two warnings that matter (body shrank, alias points nowhere)
get missed.

Fixed in both places:
- `validate.mjs` treats a missing upstream **root** as one skipped comparison, not N broken skills:
  it prints one note and sets the comparison aside.
- `selftest.sh` gate 2 only passes `--upstream` when `upstream/deepseek-stack/skills` exists, and
  says which comparison it skipped (the same shape gate 4 already used).

Verified three ways:

| Case | Result |
|---|---|
| fresh clone, no upstream | `35 skills | 0 FAIL | 0 WARN`, whole run has **0** WARN lines, skip is stated once |
| upstream fetched | `0 WARN`; gate 4 now executes and reports `rebuilt tree is byte-identical to skills/` |
| body gutted in a throwaway copy | **still fires**: `WARN ds-mode body shrank to 6% of upstream (32->2 lines)` |

The third case is the point: removing the noise did not weaken the check.

Merged as PR #4, `main` = `21594c4` (2026-10-31). The published clone now runs all six gates with
no warning noise on a clean tree.

---

## Round 8 — the build stamp stops covering aliases

The stamp was binding three things: the patch, `skills/` and `aliases/`. The first two are build
output; the third is not. Aliases are hand-written content that `install.mjs` copies straight from
`aliases/`, so editing one made `install.mjs` refuse until `./tools/build.sh` ran — a rebuild that
could not even capture the edit, because the patch pipeline only covers `skills/`. The
clean-checkout fallback had the same flaw: it called any dirty path under `aliases/` suspicious.

Fixed in `tools/stamp.mjs` only. The stamp now records the patch and `skills/`; the fallback checks
`git status` over `skills/` alone. `digestAliases` is gone. Aliases remain guarded where it makes
sense: `validate.mjs` still checks six files, unique names, frontmatter and that each target exists,
and install runs that check before and after copying.

| Case | Result |
|---|---|
| alias edited, no stamp (this worktree) | `install.mjs --dry-run` exit 0; `stamp.mjs verify` exit 0 |
| `SKILL.md` edited, no stamp | `stamp.mjs verify` exit 1 — `skills/ has uncommitted changes` |
| alias edited, stamp present | `stamp.mjs verify` exit 0; `install.mjs --dry-run` exit 0 |
| `SKILL.md` edited, stamp present | `stamp.mjs verify` exit 1 — `skills/ changed since the build` |
| patch edited, stamp present | `stamp.mjs verify` exit 1 — `tools/optimize.patch changed since the build` |
| stamp written by the old code (extra `aliases` field) | ignored, verifies exit 0 |
| `./tools/selftest.sh` | `SELFTEST PASSED` |

The skill and patch rows are the point: dropping aliases did not weaken the guard that catches an
unbuilt or hand-edited `skills/` tree.

---

## Round 9 — an alias target is declared, not inferred

`install.mjs` and `validate.mjs` both found an alias's target by taking the **first backticked
`ds-*` token in the body**. That is prose parsing standing in for data: a body reading "start from
`ds-principles`, then follow `ds-plan-loop`" validated clean and installed pointing at
`ds-principles` — a live gesture that loads the wrong skill, with no warning.

Fixed by declaring the target where it belongs: frontmatter `metadata.aliasOf` (a key DSH already
parses as metadata and preserves). Both tools read the declaration first. Prose remains a fallback
with a WARN, so older aliases keep working, and a declared name that is malformed or does not exist
is a FAIL.

| Case | Result |
|---|---|
| body names another `ds-*` first, `metadata.aliasOf` correct | metadata wins; WARN notes the disagreement; pass |
| `metadata.aliasOf` points at a missing skill | **FAIL** `alias points to missing skill` |
| no declaration, prose only | falls back with WARN `target inferred from prose` |
| malformed declared name (`DS_Plan`) | **FAIL** `not a kebab-case skill name` |
| `install.mjs --dry-run` with prose-first body | still resolves `ds-plan-loop` from the declaration |

All six aliases now declare their targets, and `selftest` gained **gate 7** so the inference cannot
come back: it asserts every alias declares `metadata.aliasOf`, that a prose mention cannot override
the declaration, and that a missing declared target is rejected.

Reinstall was required (the installed aliases changed) — gate 3 caught the drift with six
`differs` entries before the reinstall, which is that gate earning its keep.

---

## Round 10 — a skill is a directory, so hash every file

The manifest recorded one `sha256` per skill: `SKILL.md`. Everything else in a skill directory was
therefore unprotected — `ds-watch-pr` ships `scripts/watch_pr.py`, and editing that script and then
running `--uninstall` would have deleted the edit without a word. Uninstall was verifying the one
file nobody changes.

`install.mjs` now records a per-file hash map (manifest **v3**) and uninstall compares all of them:

| Case | Result |
|---|---|
| every recorded file matches | entry removed |
| any file's hash differs | **kept**, named (`"scripts/watch_pr.py" changed since install`), exit non-zero |
| an unexpected extra file appeared | kept — safer than deleting something unrecorded |
| a recorded file is missing | kept, reported |
| older v2 manifest (SKILL.md hash only) | falls back to that check instead of failing loudly |
| `--force` | deletes regardless |

`selftest` gate 5 gained a second case: install into a scratch target, edit
`ds-watch-pr/scripts/watch_pr.py`, and assert uninstall keeps the skill, then that `--force` clears it.

### Review — ds-review-loop, 1 round

Reviewer: a fresh-context DeepSeek subagent (the only model route available; no stronger one).
Verdict **APPROVE**, four nits, all reproduced by the reviewer and all fixed — none was a goal case.

| Finding | Outcome |
|---|---|
| R1 alias entry with no recorded `sha256` was deleted without `--force` | **fixed** — an alias with no recorded hash is now kept and named |
| R2 `violation()` threw on an odd filesystem (file where a dir belongs, EACCES, dangling symlink), aborting the whole uninstall | **fixed** — `statSync(...).isDirectory()` check plus try/catch that turns a throw into a keep reason (`could not verify`) |
| R3 gate 5 tested only "recorded file changed", leaving the missing-file and extra-file branches unguarded | **fixed** — gate 5 now also deletes a recorded file and adds an unexpected one, and asserts `--force` clears each |
| R4 unreachable `!rec` guard | **fixed** — removed |

Process note: the reviewer took ~7 minutes and 18 tool calls, and I twice judged it finished too early —
once spawning a second reviewer, which ds-review-loop's "one reviewer at a time" rule forbids. Its
output was discarded; only round 1 counts.
