# Session log — deepseek-stack adapted for the DeepSeek Harness

One continuous build session, recorded in `conversation/`. This file is the handover: what was
done, what was measured, what broke, what is still open.

## Outcome

- 29 upstream skills adapted to DSH and installed to `~/.agents/skills`
- 6 gesture-only aliases added (`/ds-plan` → `ds-plan-loop`, …) at zero catalog cost
- all of it published to the fork: `Stijnus/deepseek-stack`, PR #1 merged (`488f5c0`)
- uninstall hardened after the initial publish: PR #2 merged
- installed-root drift detection added: PR #3 merged
- gate 2 noise removed: PR #4 merged
- stamp decoupled from aliases: PR #6 merged
- alias target declared + CI added: PRs #7, #8 merged
- per-file uninstall protection, contract check, release: PRs #9–#12, `main` = `876bd5a`, tag `v1.0.0`
- tooling that makes the adaptation reproducible: build from a patch, validate the contract,
  stamp an install, reconcile removals, detect routing conflicts

## The DSH facts that drove every decision

Read out of the shipped `app.asar`, not assumed:

| Fact | Where | Consequence |
|---|---|---|
| Skills load from `<project>/.dsh/skills` (100), `<project>/.agents/skills` (200), custom dirs (300), `~/.dsh/skills` (400), `~/.agents/skills` (500), bundled (600) | `dsh-skill-filesystem` README | install target is rank 500; it beats the `.claude` provider at 900/950 |
| Frontmatter: `name` + `description` required; optional `whenToUse`, `metadata`, `disable-model-invocation`, `user-invocable` | same | everything else is dropped; camelCase legacy keys drop the whole skill |
| Catalog renders **name + capped description only** (`catalogDescriptionMaxLength` 500); `whenToUse` is never rendered | `dsh-tool-skill` README | the description *is* the router, and it is re-sent every session — so it is worth optimizing |
| Model catalog = `.filter(isModelInvocable)` | `tool-skill` source | `disable-model-invocation: true` skills cost **zero** catalog tokens |
| `/name` gesture matches one whitespace-bounded exact token, filtering only `isUserInvocable` | `tool-skill` source | a hidden skill is still reachable by gesture — the basis for the aliases |
| Non-model-invocable skills still appear in the `/` menu with a `user-only` marker | `client-ui-skill` | alias text is user-visible UI copy; my first rationale ("never rendered") was wrong and was corrected |

## Skill content changes

- descriptions rewritten to 120–200 chars; self-references ("Invoke as /ds-x") removed — the name
  already *is* the gesture. Catalog: **7,238 → 5,559 chars** (≈2,010 → ≈1,544 tokens/session)
- `## On DeepSeek Harness` blocks added: `subagent`, `subagent_fork`, `workflow`,
  `list_subagent_models`, `job_output({wait:true})`, `ask_user_question`, `create_goal`,
  `moodboard`, `gh`
- four upstream defects fixed: `ds-tdd` ambiguous rule, `ds-ledger` tab contradiction,
  `ds-pr` body file never created, `ds-plan-loop` treating a silent critique as a passed one
- three routing-collision clusters fixed: `code-review`, the design/audit cluster, orchestration

## What broke, and what was built because of it

Every guard exists because something failed first:

1. `git apply` inside a git repo resolved patch paths against the repo root and *silently skipped
   every file*, exit 0 → switched to `patch -p1`
2. `build.sh` deleted `skills/` before applying the patch; a conflict left a pristine tree that
   validated clean and would ship → build in a temp tree, validate, then swap
3. A hand edit could drift `skills/` from the reviewable patch → `tools/stamp.mjs` binds an
   install to a built tree (or a clean checkout, for a published clone)
4. Deleting an alias left it answering forever → install reconciles manifest-owned removals
5. An alias whose target was renamed stayed "valid" → validator FAILs on a missing target, and on
   an alias/bundle name collision
6. An empty `aliases/` was a green build → expected-inventory check
7. A dispatched plan critique returned nothing and was treated as passed → `ds-plan-loop` now says
   a review call that returns nothing is a failed step, not a pass

## Numbers

- 29 skills + 6 aliases; catalog 5,559 chars (~1,544 tokens/session)
- `optimize.patch`: 29 files, one hunk set each
- selftest: 4 gates; installed tree byte-identical to the built tree; 0 FAIL / 0 WARN
- name collisions across `~/.agents`, `~/.claude` and the rev-eng pack: none (71 names in play)

## Not planned (accepted by design)

- **Alias names are gesture-only.** `skill({name:"ds-plan"})` fails on purpose: DSH exposes a
  `disable-model-invocation` skill only through its `/name` gesture, and there is no alias primitive
  to inherit. The loadable name is `ds-plan-loop`; each alias body says so. Accepted rather than
  "fixed" — the alternatives are dropping the aliases or making six duplicate entries model-visible
  and paying catalog tokens for them.

## Closed

- **Alias target is declared, not inferred** (the `pointsTo` item). Merged as PR #7, `main` =
  `56bb7cc` (2026-10-31), with CI green. Target moved from "first backticked `ds-*` token in the
  body" to frontmatter `metadata.aliasOf`; both tools read the declaration first, prose is a WARN
  fallback, and a malformed or missing target FAILs. Guarded by `selftest` gate 7.
- **CI added** (PR #8, `main` = `3ef632b`). The repo had none — `gh pr checks` reported nothing and
  there were zero workflow runs ever. `.github/workflows/gates.yml` now fetches the pinned upstream
  and runs all seven gates on every PR and on pushes to `main`.
- **Stamp no longer covers `aliases/`** (original list item 3). Merged as PR #6, `main` = `778c34a`
  (2026-10-31). An alias edit is content, not a rebuild: no aliases digest on write, no comparison
  on verify, clean-checkout fallback scoped to `skills/`. A modified `SKILL.md` is still refused.
  Landed from the bare arm of the A2 trial; trial artifacts in `trials/a2/`.
- **B0 — gate 2 no longer emits 29 WARNs on a fresh clone.** Merged as PR #4, `main` = `21594c4`
  (2026-10-31). Found while running A1. `validate.mjs` reports a missing upstream root once instead
  of per skill; `selftest` gate 2 passes `--upstream` only when the tree exists. Proof the check
  still bites: a gutted body still warns `body shrank to 6% of upstream (32->2 lines)`.
- **Item 3 — `selftest` gate 3 diffs the installed root against this repo.** Merged as PR #3,
  `main` = `7592bc9` (2026-10-31). New read-only `install.mjs --verify-install` reports `missing`,
  `differs` and `stale` entries against the manifest; gate 3 runs it after the contract check, and
  gate 6 proves the detector still catches an edited file. `selftest` now has six gates.
  Docs: `USAGE.md`, `README.md`, `PLAN.md` Round 6.
- **Item 1 — `--uninstall` verifies `sha256` before deleting.** Merged as PR #2, `main` = `186671d`
  (2026-10-31). A skill or alias changed since install is kept, named in the output, and the
  command exits non-zero; the manifest entry is retained so `--force` can still remove it later.
  Guarded by `selftest` gate 5. Docs updated: `USAGE.md` (four gates), `PLAN.md` (Round 5).

- **Per-file uninstall protection** (B2, the last silent-data-loss path). Merged as PR #9, follow-ups
  in PR #10; `main` = `3a45b29`. The manifest hashes every file in a skill (v3), uninstall names a
  missing file and refuses an added file or directory, v2 manifests still work. Guarded by selftest
  gate 5, extended with missing-file, extra-file, added-directory and v2 cases.
- **DSH contract check** (B4). Merged as PR #11, `main` = `6ef7e82`. `tools/dsh-contract-check.mjs`
  asserts the six app behaviours the pack relies on and self-tests that it can fail; selftest gate 8.
- **A3 — `ds-review-loop` trial.** One round against the B2 diff with a fresh-context reviewer
  (deepseek-flash — the only route available): verdict APPROVE, four nits, all reproduced and fixed
  (alias with no recorded hash, unguarded verification, two untested gate branches, one dead guard).
  Reviewer took ~7 minutes and 18 tool calls. Process error recorded: I judged it finished too early
  and spawned a second reviewer, which `ds-review-loop` forbids; its verdict was discarded.
- **A4 — `ds-pr` trial.** Used the skill to file PR #11. It worked, but `gh pr create` does **not**
  push the branch despite the skill's DSH note saying filing pushes: the first attempt failed with
  "No commits between main and fix/dsh-contract-check", and an explicit `git push` fixed it.
- **C1 — `npx skills add` verified.** In an isolated HOME: 29 skills installed, byte-identical, lock
  file source `Stijnus/deepseek-stack`, plus a ZCode root. It does **not** install the six aliases
  (flat files under `aliases/`), which the README had implied; fixed in PR #12.
- **C2/C3 — hygiene.** Deleted the 448 KB redundant staging tree; refreshed the conversation snapshot
  (2,828 records, current through the last turn at capture time).
- **C4 — release.** `v1.0.0` tagged at `876bd5a` with a GitHub release built from `CHANGELOG.md`
  (PR #12 added it).

## Resuming

The transcript ends at the moment this workspace was created (the live session kept appending after
the copy). To refresh it later:

```bash
# find the session id in DSH, then re-extract
python3 - <<'PY'
import json, zstandard, io
# read all zstd frames, not just the first
with zstandard.ZstdDecompressor().stream_reader(open(SRC,'rb')) as r: ...
PY
```
