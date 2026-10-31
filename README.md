# deepseek-stack — DeepSeek Harness fork

[![upstream](https://img.shields.io/badge/upstream-aicodeking%2Fdeepseek--stack-blue)](https://github.com/aicodeking/deepseek-stack)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Agent skills that make a cheap model plan, verify and ship instead of guessing — **adapted for the
DeepSeek Harness (DSH)**.

29 skills, six `/short-name` gestures, and the tooling that keeps the adaptation reproducible.
Forked from [`aicodeking/deepseek-stack`](https://github.com/aicodeking/deepseek-stack) at
`d4f1ebe` (see [`UPSTREAM-COMMIT`](UPSTREAM-COMMIT)). MIT.

## Why a fork

The upstream pack is harness-neutral by design: it says things like *"send this to subagents when
the harness has them"* and *"ask with the harness question tool."* On a real harness that vagueness
is where a cheap model stalls — it does not know which primitive exists, so it silently skips the
step. This fork keeps every upstream loop and stop-condition, then binds each one to a concrete DSH
capability and re-tunes the description text for DSH's routing model.

## What changed

| Change | Why |
|---|---|
| Descriptions rewritten to 120–200 chars | DSH routes **only** on `name` + a capped `description`, and never renders `whenToUse`. The description is the entire routing signal *and* it is re-sent every session. |
| `whenToUse`-style keys removed, frontmatter reduced to `name` + `description` | DSH parses `whenToUse` and never renders it; other keys are ignored. |
| `## On DeepSeek Harness` block added to most skills | Maps the upstream abstractions to `subagent`, `subagent_fork`, `workflow`, `list_subagent_models`, `job_output({wait:true})`, `ask_user_question`, `create_goal`, `moodboard`, `gh`. Three to six bullets, only where a skill needs one. |
| Six gesture aliases (`/ds-plan`, `/ds-verify`, …) | Users type the short name. Aliases set `disable-model-invocation: true`, so they are reachable by the `/name` gesture but excluded from the model catalog — **zero catalog tokens**. |
| Collision clauses on five descriptions | `ds-review-loop` vs `code-review`, `ds-design`/`ds-design-audit` vs the web-design and accessibility skills, `ds-swarm` vs `orca` orchestration. |
| Four upstream defects fixed | An ambiguous `ds-tdd` rule, `ds-ledger`'s tab contradiction, `ds-pr`'s missing body file, and `ds-plan-loop` treating a silent critique as a passed one. |
| Tooling: validate / build / install / stamp / selftest / conflicts | The adaptation is one reviewable patch (`tools/optimize.patch`), not an untracked edit. See [Maintain](#maintain). |

Measured effect of the description rewrite: the 29 model-visible entries cost **5,559 characters
(~1,544 tokens) per session**, down from 7,238 characters upstream despite the added clauses.

Full reasoning: [`USAGE.md`](USAGE.md), [`docs/DSH-MAPPING.md`](docs/DSH-MAPPING.md),
[`docs/CONFLICTS.md`](docs/CONFLICTS.md), [`docs/OPTIMIZATION-SPEC.md`](docs/OPTIMIZATION-SPEC.md),
and the build log in [`PLAN.md`](PLAN.md).

## Install

**Any harness that reads `SKILL.md`** (Claude Code, Codex, Cline, OpenCode, …):

```bash
npx skills add Stijnus/deepseek-stack
```

That installs the 29 skills (verified: byte-identical to this repo, lock file source
`Stijnus/deepseek-stack`). It does **not** install the six gesture aliases — they are flat files under
`aliases/`, which the `skills` CLI does not pick up. Use the DSH installer below when you want the
`/ds-plan`-style gestures.

**DeepSeek Harness**, straight into the user-level skill root (rank 500):

```bash
git clone https://github.com/Stijnus/deepseek-stack.git
cd deepseek-stack
node tools/install.mjs --dry-run     # show the plan
node tools/install.mjs               # 29 skills + 6 aliases into ~/.agents/skills
```

Installing writes outside the workspace, so DSH may ask for one approval. A running session picks
the skills up on its next step — the provider watches the root — with no restart.

## Use

Skills are plain `SKILL.md` bundles. DSH advertises them in the session catalog and loads the body
when the task matches, or when you ask directly:

```text
/ds-verify-loop make the auth tests pass
/ds-plan-loop rework billing into three files per step
/ds-ship the session cookie is not refreshed — fix it and merge when green
```

`/ds-plan`, `/ds-verify`, `/ds-review`, `/ds-context`, `/ds-best`, `/ds-audit` are gestures only:
they inject a pointer, they are **not** loadable with `skill({name: "ds-plan"})`. The loadable name
is `ds-plan-loop`.

Unsure which to use? Ask for `ds-help` — it maps the task to exactly one skill.

## Skills

| Group | Skills |
|---|---|
| Core | `ds-mode` `ds-principles` `ds-help` |
| Loops | `ds-plan-loop` `ds-verify-loop` `ds-unstick` `ds-context-reset` `ds-ledger` `ds-review-loop` `ds-jury` `ds-best-of-n` `ds-swarm` |
| Build | `ds-sharpen` `ds-blueprint` `ds-tdd` `ds-blast-radius` `ds-design` `ds-design-audit` |
| Ship | `ds-pr` `ds-watch-pr` `ds-ship` `ds-ready` `ds-adopt` `ds-revive` `ds-pr-comments` |
| Understand | `ds-explain` `ds-catchup` `ds-lessons` `ds-unslop` |

## Layout

```
skills/            the 29 optimized skills — this is what `npx skills add` installs
aliases/           six gesture-only aliases (disable-model-invocation: true; target in metadata.aliasOf)
tools/
  fetch-upstream.sh  clone the pinned pristine upstream into upstream/ (not committed)
  build.sh           rebuild skills/ = upstream + optimize.patch, validate, then swap
  optimize.patch     every edit to upstream, as one reviewable diff
  validate.mjs       DSH skill contract + pack budgets + alias integrity
  stamp.mjs          bind an install to a successful build
  install.mjs        install skills + aliases, reconcile removals, verify what landed,
                     --verify-install checks the installed root against this repo
  selftest.sh        the four gates
  conflicts.mjs      name collisions and overlapping routing triggers
  dsh-contract-check.mjs  assert the shipped DSH app still matches this pack's assumptions
docs/              the DSH contract, the optimization spec, the conflict analysis
USAGE.md           how to use the pack on DSH
PLAN.md            build log, including what went wrong
```

## Maintain

`upstream/` is fetched, not committed: a fork's git history already holds the baseline.

```bash
./tools/fetch-upstream.sh       # once, and again after bumping UPSTREAM-COMMIT
./tools/selftest.sh             # four gates: stamp, source contract, installed root, determinism

./tools/build.sh                # rebuild skills/ from upstream + patch (validates before swapping)
./tools/build.sh --regen-patch  # after a hand edit, capture it into the patch
node tools/install.mjs          # install / --dry-run / --uninstall / --verify-install
```

Three gates protect an install, each because a real failure once got through: a build stamp that
refuses an unbuilt or hand-edited tree, a build that applies and validates before replacing
`skills/`, and reconciliation so a deleted skill cannot keep answering its gesture.

The stamp covers `skills/` and `tools/optimize.patch`, not `aliases/`: alias text is content, so
`node tools/install.mjs` picks up an alias edit without a rebuild. A modified `SKILL.md` still
fails the stamp until it is captured in the patch.

## Compatibility

The upstream body text is preserved; DSH-specific guidance is additive and contained in the
`## On DeepSeek Harness` blocks, so the pack still works in any `SKILL.md` harness. The aliases and
`tools/` are DSH-specific extras — harnesses that ignore them lose nothing.

Requirements: `node` 18+ for `tools/`, `git` for fetching upstream, `gh` (signed in) for the ship
skills, `python3` for `ds-watch-pr`'s watcher.

## License and attribution

MIT, same as upstream — see [`LICENSE`](LICENSE), © 2026 AICodeKing. This is an independent fork;
the original pack and its design are the upstream author's work. Defects found and fixed here are
documented in [`USAGE.md`](USAGE.md) rather than hidden.
