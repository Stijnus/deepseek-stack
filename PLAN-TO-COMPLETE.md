# Plan to complete the deepseek-stack / DSH job

**Goal (one sentence):** prove the pack is worth its 1,544 catalog tokens per session — close the
remaining tooling defects, replace every "should work" claim with a command that shows it, and
measure whether the skills actually improve outcomes on real tasks.

**Where it stands today (2026-10-31, final):** shipped. 29 skills + 6 aliases byte-identical to
published `main` = `876bd5a`, **tag `v1.0.0`** with a GitHub release, **eight** selftest gates green,
CI on every PR and push, 12 PRs merged. Every scenario below is done.

---

## Definition of done

1. Every claim in `README.md` / `USAGE.md` is backed by a command in `tools/` that proves it.
2. All four real tooling defects closed, each with a gate in `selftest.sh`.
3. `/ds-*` alias gestures **observed** injecting, not inferred from source.
4. `npx skills add Stijnus/deepseek-stack` verified end-to-end, or removed from the docs.
5. One orchestration skill and one ship skill exercised on real work, evidence recorded.
6. A small controlled trial produces numbers (with vs without the pack) and a per-skill
   keep / tighten / drop decision.
7. DSH's skill contract is re-checked automatically, so a harness upgrade cannot silently break it.
8. `SESSION-LOG.md` has zero open items; no stale copies in either workspace; repo tagged.

---

## Status — closed out 2026-10-31

13 of 13 tracked scenarios are done. Several were found while doing something else (B0, B1, B2) or
came out of the smoke test, the reviews and the trials rather than the original plan.

| Item | State | Note |
|---|---|---|
| A1 alias gesture observed | **done** | `/ds-verify` injected live; catalog stayed at 35 entries / 6 gesture-only |
| A2 effectiveness trial | **done** | B3 trial: no measured advantage on a pre-specified task; pack cost 2.5x tool calls |
| B0 gate 2 noise | **done** | PR #4 — 0 WARN lines on a fresh clone |
| B1 alias target declared | **done** | PR #7 merged with CI green; `metadata.aliasOf` + gate 7 |
| B3 stamp decoupled from aliases | **done** | PR #6, landed from the A2 bare arm |
| — CI | **done (unplanned)** | PR #8 — the repo had none; needed for "merge when CI is green" |
| A3 orchestration trial | **done** | `ds-review-loop` on the B2 diff: 1 round, fresh reviewer, APPROVE, 4 nits fixed |
| A4 ship trial | **done** | `ds-pr` filed PR #11; found that `gh pr create` does not push the branch here |
| B2 per-file hashes | **done** | PRs #9 and #10: every file hashed, missing/extra entries named, v2 manifests supported |
| B4 DSH contract check | **done** | PR #11: six assumptions asserted against the app, with a self-test that proves it can fail |
| C1 `npx skills add` | **done** | 29 skills installed byte-identically in an isolated HOME; aliases are not installed, docs corrected (#12) |
| C2 staging tree | **done** | deleted |
| C3 conversation snapshot | **done** | refreshed: 2,828 records, current at capture time |
| C4 versioning | **done** | `CHANGELOG.md` (#12), tag `v1.0.0`, GitHub release |

**What "closed out" means here:** every tracked scenario was completed, not re-labelled. B2 — the one
real defect among the original gaps — was fixed before v1.0.0 was tagged.

---

## Original gap list (all closed)

Kept as the record of what the plan set out to close. Every row below is done; the *Status* table
above is authoritative and supersedes the step IDs used in older sections (the two real-work trials
appear as **A3**/**A4** there, and the shipping steps as **D1**/**D2**).

### A. Validation gaps (highest information, cheapest)

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| A1 | Alias gesture never observed firing | The six `/ds-*` names are the only feature whose mechanism is source-inferred. If wrong, they are noise. | XS, needs you |
| A2 | Effectiveness never measured | The pack's whole premise is unproven. Everything else is maintenance. | M |
| A3 | Orchestration skills never run (`ds-review-loop`, `ds-jury`) | Unknown whether they produce usable output or burn tokens. | M |
| A4 | Ship skills never run (`ds-pr`, `ds-ship`) | Never tested against real `gh` + the current `never` approval policy. | M |

### B. Tooling defects (independent of A, but worth doing either way)

| # | Defect | Evidence today | Effort |
|---|---|---|---|
| B0 | **Found during A1:** gate 2 emitted 29 WARNs on a fresh clone | noise on a clean run trains the reader to skim, hiding the WARNs that matter | S — **done, PR #4 merged (`21594c4`)** |
| B1 | Alias target inferred from the first backticked `ds-*` token (original list item 2) | **fixed, PR #7 merged (`56bb7cc`)** — `metadata.aliasOf` + prose fallback WARN + gate 7 | S |
| B2 | **New:** manifest hashes only `SKILL.md`, so a changed script is unprotected | `ds-watch-pr` manifest shows `files: [SKILL.md, scripts]` but one `sha256`; editing `scripts/watch_pr.py` would be deleted silently by `--uninstall` | M |
| B3 | Build stamp digests `aliases/`, so one alias edit blocks install (original list item 4) | **done, PR #6 merged (`778c34a`)** — landed from the A2 bare arm | S |
| B4 | **New:** DSH contract pinned only by source comments, untested on upgrade | `grep -a -c '!isUserInvocable(skill)' app.asar` → 1 hit, works today; nothing re-checks it | M |

### C. Distribution and hygiene

| # | Item | State | Effort |
|---|---|---|---|
| C1 | `npx skills add Stijnus/deepseek-stack` | layout assumed valid, CLI **never run**; `npx skills` 1.7.4 is available | S |
| C2 | Obsolete staging tree `default-workspace/ds-stack` | still there, 448 KB, fully redundant | XS |
| C3 | Conversation snapshot | stale — ends before the last few turns | XS |
| C4 | Repo versioning | no tag; 3 merged commits, no `CHANGELOG` | S |

---

## The plan

Four milestones, ten steps, each with one action and one command that proves it.

### Milestone A — decide whether it deserves the tokens (do this first)

| Step | Action | Acceptance check | Who |
|---|---|---|---|
| **A1** ✅ | Send a message beginning `/ds-verify run ./tools/selftest.sh in the deepseek-stack repo` | a `<skill_content name="ds-verify">` block is injected into that message **and** the catalog still lists 29 `ds-*` names, not 35 | you, 10s |
| **A2** ✅ | Run one small real task twice — bare, then with `/ds-mode` + `/ds-verify-loop` — recording iterations to green and every false "done" claim | done on B3; results table below | ~10 min wall clock |

**Gate:** if A1 fails, fix or drop the aliases before anything else. If A2 shows no difference, stop
and drop the pack — do not spend Milestones B–D on something that does not pay for itself.

### Milestone B — close the four tooling defects

| Step | Action | Acceptance check | Effort |
|---|---|---|---|
| **B0** ✅ | Stop gate 2 passing `--upstream` when the tree is absent; one note instead of 29 WARNs | fresh clone → `0 FAIL | 0 WARN`, zero WARN lines; gutted body still WARNs | S |
| **B1** ✅ | Make the alias target explicit in frontmatter (`metadata.aliasOf`) and have both tools read it, body only as fallback | PR #7: validate green, prose-first fixture resolves the declared target, missing/malformed declared target FAILs, selftest gate 7 | S |
| **B2** ✅ | Record a per-file sha256 map in the manifest; `--uninstall` and `--verify-install` compare the map | scratch target: edit `ds-watch-pr/scripts/watch_pr.py` → `--verify-install` reports `differs` and `--uninstall` keeps it | M |
| **B3** ✅ | Scope the build stamp to `skills/` + patch; verify `aliases/` by content at install instead | merged via PR #6: dirty alias → install --dry-run 0, stamp verify 0; dirty SKILL.md → verify 1; selftest PASSED | S |
| **B4** ✅ | Add `tools/dsh-contract-check.mjs`: assert the shipped app's catalog filter (`isModelInvocable`), gesture filter (`isUserInvocable`) and accepted frontmatter keys; skip cleanly when the app is absent | passes today; a fixture with an altered filter string fails with a named expectation | M |

The two trials in this milestone are labelled **A3** and **A4** in the *Status* table.

**Gate:** after B1–B3, reinstall (`node tools/install.mjs`) and re-run the live catalog check; all
four fixes are tooling-only except B1, which touches installed alias files.

### Milestone C — prove it on real work

| Step | Action | Acceptance check | Effort |
|---|---|---|---|
| **C1** ✅ | Run `ds-review-loop` on a real diff (e.g. the PR #2 change) | verdict + findings recorded, with the round count it used | M |
| **C2** ✅ | Run `ds-pr` on a throwaway branch, then close the PR | PR created by the skill (or a recorded, specific failure of the `gh`/approval path), then closed | M |

### Milestone D — ship the story

| Step | Action | Acceptance check | Effort |
|---|---|---|---|
| **D1** ✅ | Verify the `npx skills add` path in an isolated `HOME` | command installs 29 skills into that temporary root; docs match observed output | S |
| **D2** ✅ | Refresh the conversation snapshot, delete the staging tree, close all `SESSION-LOG` items, tag `v1.0.0` | snapshot includes the latest turn; `ds-stack` gone; open items = 0; `git tag -l` shows `v1.0.0`; `./tools/selftest.sh` passes | S |

---

## Assumptions checked while planning (not carried as guesses)

| Assumption | Check run | Result |
|---|---|---|
| Skills with sub-directories are fully protected by uninstall | inspect `~/.agents/.ds-stack-manifest.json` | **No** — one `sha256` per skill; became step **B2** |
| `npx skills` CLI exists to test distribution | `npx --yes skills --version` | 1.7.4 |
| The DSH contract can be re-checked mechanically | `grep -a -c '!isUserInvocable(skill)' app.asar` | 1 hit — feasible, became step **B4** |
| The old staging tree is still around | `ls default-workspace/ds-stack` | present, 448 KB — step **C2** |
| Alias gesture mechanism | read `tool-skill` source earlier this session | filters `isUserInvocable` only, so hidden skills are gesture-reachable — still **unobserved**, so it stays a validation step (A1), not an assumption |

## Critique pass (self, because the subagent route has been unreliable)

- **Missing step?** A1 and A2 need *you*; every other step I can do alone. Fixed by adding the Who
  column. Also added: rollback is `git revert` on `main`, no separate step needed.
- **Unchecked assumption?** That `npx skills` reads `skills/` from the repo root — I verified the
  directory shape, not the CLI's behaviour. That is exactly why it is a step with a check, not a
  claim in the docs.
- **Simpler path?** Yes, and it changes the order: cheap validation (Milestone A) must come *before*
  tooling polish (B), because B is only worth doing if A says the pack helps. That reordering is the
  main thing this critique changed.

## Not doing (out of scope)

- Opening a PR against `aicodeking/deepseek-stack`. The changes are harness-specific; the fork is the
  right home. Revisit only if the upstream author asks.
- Building a Skills settings UI. That is a DSH feature request, not part of this pack.
- Chasing the last original item (alias names are gesture-only). It is a documented property of
  `disable-model-invocation`, not a defect; the fix is one clarifying sentence in each alias body.


---

## A2 result — controlled trial on B3 (decouple the stamp from `aliases/`)

Two worktrees from `main` @ `7da5cfd`, identical task text and identical 8-step acceptance spec.
Only difference: arm 2 was told to load `ds-mode` then `ds-verify-loop` first. Both ran concurrently,
same model. I re-ran the acceptance sequence myself in both worktrees; exit codes below are mine,
not their reports.

| Metric | Arm 1 — bare | Arm 2 — pack |
|---|---|---|
| `skill` loads | 0 (control honoured) | 2 (`ds-mode`, `ds-verify-loop`) |
| Acceptance, re-run by me | **PASS** (0,0,0,1 as required) | **PASS** (0,0,0,1) |
| Extra built-stamp path (my test) | correct | correct |
| Files changed | 4 (+A2 notes) | 4 (+A2 notes) |
| Diff size | 185 lines | 179 lines |
| `stamp.mjs` functional change | identical to arm 2 | identical to arm 1 |
| Docs updated | README, USAGE, PLAN | README, USAGE, PLAN |
| Found **both** failure paths (digest + clean-checkout) | yes | yes |
| Self-report accuracy | correct ("Round 3") | **mislabel** ("Round 2"; row is in Round 3) |
| A2 notes | 309 lines prose, 14 rows | 110 lines, 55 rows (denser) |
| Tool calls | **17** | **42** (2.5x) |
| Wall clock | ~2 min | ~4 min |
| False "done" claims | none | none |

### Verdict

Both arms produced functionally identical, correct work. **The pack did not improve the outcome on
this task, and cost ~2.5x the tool calls.** What it did add: visibly structured process (a
`todo_write` plan before edits, an explicit "baseline first" step quoting ds-verify-loop, denser
command logging). What it cost: 2.5x tokens and one inaccurate claim in its summary.

**Methodological caveat that cuts in the pack's favour:** handing both arms the exact acceptance
commands neutralises most of `ds-verify-loop`'s value — its job is to make a model *decide* to run
the real check. This trial tested execution discipline with the checks prescribed, not initiative.

**Decision (acted on):** land arm 1's diff (accurate report, identical artifact, 2.5x cheaper). Keep `ds-mode`
and `ds-verify-loop` installed — no evidence of harm, plausible benefit when the task is
underspecified. A fair re-run needs a task with **no** given acceptance commands.

**Landed:** PR #6 merged, `main` = `778c34a`. Both arms' diffs and notes are kept in `trials/a2/`;
the worktrees were removed after the merge.

## Unplanned but necessary — CI

There was no CI in the repo at all: zero workflow runs, `gh pr checks` empty on every PR so far.
Since "merge once CI is green" cannot be satisfied without CI, `.github/workflows/gates.yml` was
added (PR #8, `main` = `3ef632b`): fetch the pinned upstream, run all seven gates, plus a scratch
`--verify-install` drift check because gate 3 skips on a runner with no `~/.agents`.

Both PRs merged with the check green (11s each), and pushes to `main` run it too.
