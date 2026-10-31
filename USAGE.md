# deepseek-stack, optimized for DeepSeek Harness

29 agent skills that make a cheap model plan, verify and ship instead of guessing.
Installed, adapted to DSH, and verified.

- Upstream: [aicodeking/deepseek-stack](https://github.com/aicodeking/deepseek-stack) @ `d4f1ebe`, MIT
- Installed to: `~/.agents/skills/` — 29 skills (`ds-*/SKILL.md`) + 6 aliases (`ds-*.md`)
- Manifest: `~/.agents/.ds-stack-manifest.json`
- Status: 29/29 in the live catalog, validator clean (0 FAIL, 0 WARN)

## Use them — three ways

**1. Let the model pick.** Do nothing special. DSH advertises all 29 in the session catalog
with a one-line description each, and a matching description makes your agent load the skill
before acting. This is the normal path.

```text
fix the flaky login test          → ds-tdd or ds-verify-loop
why does the retry loop exist?    → ds-explain
```

**2. Type the slash gesture.** A whitespace-bounded `/ds-name` anywhere in your message makes
DSH inject that skill's full body into the step — no model decision needed. Best when you know
exactly which loop you want.

```text
/ds-verify-loop make the auth tests pass
/ds-plan-loop rework billing into three files per step
/ds-unstick it has failed the same way twice now — break out
```

Short names work too. Six gesture-only aliases cover the natural abbreviations — reachable by
`/name`, but **invisible to the model catalog**, so they cost no tokens:

| Type this | Runs |
|---|---|
| `/ds-plan` | `ds-plan-loop` |
| `/ds-verify` | `ds-verify-loop` |
| `/ds-review` | `ds-review-loop` |
| `/ds-context` | `ds-context-reset` |
| `/ds-best` | `ds-best-of-n` |
| `/ds-audit` | `ds-design-audit` |

Any other name must match a real skill exactly (`/ds-unstick`, not `/ds-unstick-me`). A near-miss
is silently ordinary prose — DSH will not guess.

**3. Ask the router.** If you do not know which skill fits, ask for `ds-help` (or type
`/ds-help`). It maps the task to exactly one skill and names a second only when the task
genuinely has two phases.

You can also load one explicitly with `skill({ name: "ds-ship" })`.

## The pack

| Group | Skills | What they are for |
|---|---|---|
| Core | `ds-mode`, `ds-principles`, `ds-help` | The always-on working style, 21 rules of thumb, and the router. |
| Loops | `ds-plan-loop`, `ds-verify-loop`, `ds-unstick`, `ds-context-reset`, `ds-ledger`, `ds-review-loop`, `ds-jury`, `ds-best-of-n`, `ds-swarm` | Bounded loops that converge: plan→build, edit→check, fail→re-think, review→agree, fan-out→merge. |
| Build | `ds-sharpen`, `ds-blueprint`, `ds-tdd`, `ds-blast-radius`, `ds-design`, `ds-design-audit` | Shape the work before writing bodies; prove a change cannot break its neighbours; give a UI a real direction. |
| Ship | `ds-pr`, `ds-watch-pr`, `ds-ship`, `ds-ready`, `ds-adopt`, `ds-revive`, `ds-pr-comments` | From branch to merged PR, including adopting someone else's work. |
| Understand | `ds-explain`, `ds-catchup`, `ds-lessons`, `ds-unslop` | Explain code, resume after a gap, turn repeated mistakes into guardrails, strip AI prose. |

## Recipes

**Ship a bugfix end to end** (you stay out of it):
```text
/ds-ship the session cookie is not refreshed on renewal — fix it and merge when green
```
→ `ds-mode` → `ds-verify-loop` → `ds-review-loop` → `ds-pr` → `ds-watch-pr` → merge gate.

**Get real second opinions** (needs a second provider — see Limits):
```text
/ds-jury is this migration safe to merge? three models, high effort
```

**Wide audit without the context cost:**
```text
/ds-swarm audit all 40 API handlers for missing authz checks; one report, evidence per handler
```

**Rescue a run that is going in circles:**
```text
/ds-unstick the build has failed the same way after three different fixes
```

**New UI that does not look generated** (uses this project's pinned moodboard):
```text
/ds-design a pricing page that matches the moodboard palette and type scale
```

**Turn this session's pain into a guardrail:**
```text
/ds-lessons the agent kept forgetting to run migrations before tests — encode it
```

## What "optimized for DSH" changed

The upstream skills are good but harness-neutral. Each edit below is in
`tools/optimize.patch` (29 files, reviewable, reversible).

| Change | Why |
|---|---|
| Frontmatter reduced to `name` + `description` only | DSH parses `whenToUse` but **never renders it**; routing reads the description alone. `pretty` keys like `allowed-tools` are dead weight. |
| Descriptions rewritten to 146–196 chars, self-references (`Invoke as /ds-x`) removed | The description is the *only* routing signal **and** it is re-sent in every session. The name already *is* the `/ds-x` gesture, so saying so wastes tokens. |
| `## On DeepSeek Harness` blocks added to 24 skills | Upstream says "subagents when the harness has them", "wait with the watcher", "ask with the harness question tool". A cheap model stalls on that vagueness. These blocks name `subagent` / `subagent_fork` / `workflow` / `list_subagent_models` / `job_output({wait:true})` / `ask_user_question` / `create_goal` / `moodboard` / `gh`. |
| 9 missing `# <name>` headings added | Upstream is internally inconsistent; several bodies start at a paragraph. |
| 6 gesture-only aliases added (`/ds-plan` → `ds-plan-loop`, …) | A user types the short name. Aliases carry `disable-model-invocation: true`, so `tool-skill:945` filters them out of the **model** catalog: the gesture works, the token cost is exactly zero. They do appear in the `/` menu with a `user-only` marker (`dsh-client-ui-skill:429`), so their text is written as UI copy. |
| Upstream bodies otherwise preserved | The loops, caps ("max 5 rounds", "six fix-watch cycles") and stop-conditions are the value. They were not rewritten. |

Measured on the session catalog:

| | chars | ≈tokens / session |
|---|---|---|
| Upstream 29 skills | 7,238 | ~2,010 |
| Optimized 29 skills | 5,497 | ~1,530 |

**−24% catalog cost**, and the routing descriptions are more specific.

## Requirements and gotchas

- **`gh`** — present (v2.102.0, logged in to github.com). Needed by all six ship skills.
- **`python3`** — present (3.9.6). Only `ds-watch-pr` uses it, for `scripts/watch_pr.py`.
- **Second provider for `ds-jury`** — a real multi-model jury needs
  `list_subagent_models` to return a second route. With one provider the skill honestly falls
  back to three persona-separated subagents and says so. It will not fake a provider.
- **Approval gate** — the sandbox is `workspace-write` and the approval policy is `ask`, so
  `git push`, merges and destructive commands can stop on a prompt. `ds-ship`/`ds-ready` treat a
  prompt as neither pass nor fail: they report what was asked and what was chosen. Expect to
  approve pushes.
- **Names match exactly — six aliases aside.** `/ds-unstick` injects; `/ds-unstick-it` is prose.
  The alias table above is the only forgiveness built in.
- **Do not mix installers.** `npx skills add aicodeking/deepseek-stack` would overwrite these
  with unoptimized copies. Uninstall first if you ever want that.

## Maintenance

Run these from this repository's root.

```bash
# one-time: fetch the pristine upstream at the pinned commit (upstream/ is not committed)
./tools/fetch-upstream.sh

# all six gates at once: build stamp, source contract, installed-root drift, rebuild determinism,
# uninstall verification, and the drift detector's own test
./tools/selftest.sh

# check the contract by hand
node tools/validate.mjs skills --aliases aliases --upstream upstream/deepseek-stack/skills
node tools/validate.mjs ~/.agents/skills --prefix ds-     # what DSH actually reads

# rebuild from pristine upstream + the reviewable patch (validates before it swaps)
./tools/build.sh              # or --pull to git-pull upstream first

# after editing a skill by hand, capture the edit in the patch (else the next build loses it)
./tools/build.sh --regen-patch

# install / inspect / remove
node tools/install.mjs --dry-run
node tools/install.mjs
node tools/install.mjs --verify-install   # read-only: does ~/.agents/skills still match this repo?
node tools/install.mjs --uninstall
```

Four gates protect the install, each because a real failure got through once:

- **Build stamp.** `tools/stamp.mjs` records digests of the patch, `skills/` and `aliases/` after
  a successful build; `install.mjs` refuses a tree that does not match. A hand edit, a tampered
  patch or a half-finished build cannot ship.
- **Build before swap.** The patch is applied and validated in a temp tree; `skills/` is replaced
  only afterwards. A conflicted patch leaves the previous good tree alone.
- **Reconciliation.** A skill or alias deleted from this repo is removed from the install root on
  the next install, so a dead `/ds-audit` cannot keep answering.
- **Uninstall verifies before deleting.** The manifest records the `sha256` written at install
  time; `--uninstall` refuses to remove anything whose hash no longer matches, lists what it kept
  and exits non-zero. A file edited after install survives unless you pass `--force`. Its manifest
  entry is kept too, so `--force` can still find it later.
- **Drift detection.** `--verify-install` compares the installed root byte-for-byte against this
  repo and reports `missing`, `differs` and `stale` entries (owned by the manifest but no longer
  produced here). Contract validation alone cannot see a stale alias or an in-place edit; this can.
  `selftest` gate 3 runs it, and gate 6 proves the detector itself still works.

Installing writes outside the workspace, so DSH asks for one approval; that is expected.

**Updating upstream.** `./tools/build.sh --pull` will *refuse* rather than guess if upstream
text moved under the patch. Resolve the conflict by re-reading `docs/OPTIMIZATION-SPEC.md`,
redoing those skills, then regenerating the patch.

## Upstream defects fixed in this build

These were real defects in the upstream text, found by running the pack. They are fixed in
`tools/optimize.patch`, not just documented:

| Skill | Defect | Fix |
|---|---|---|
| `ds-tdd` | "No test beats a bad test" can be read both ways | "A bad test is worse than no test: …" |
| `ds-ledger` | step 1 makes the tab the separator; step 4 said "no tabs" | "The tab is the separator, so a cell must not contain one." |
| `ds-pr` | REST fallback read `@body.md`, which no step created | names `pr-body.md` in both places, and `--body-file` writes it |
| `ds-plan-loop` | a fresh-pass critique that returns nothing looked like a pass | "A review call that returns nothing is a failed step, not a pass" — re-run once, then do it yourself and say so |

The last one came from a live run: the critique subagent returned neither a result nor an error,
and the plan was executed without it. The rule now makes that failure visible.

## What these skills are not

They are text, not code. They make a model behave better; they do not enforce anything. The
levers that actually bind are tests, types and lints — which is exactly what `ds-lessons` exists
to create.
