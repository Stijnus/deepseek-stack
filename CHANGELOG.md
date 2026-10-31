# Changelog

## v1.0.0 — 2026-10-31

First release of the DeepSeek Harness adaptation, published to `Stijnus/deepseek-stack`.

**Skills (29)**
- Descriptions rewritten to 120–200 characters for DSH's description-only routing; the catalog cost
  of the 29 model-visible entries fell from 7,238 to 5,559 characters per session.
- `## On DeepSeek Harness` blocks bind the upstream abstractions to `subagent`, `subagent_fork`,
  `workflow`, `list_subagent_models`, `job_output`, `ask_user_question`, `create_goal`, `moodboard`
  and `gh`.
- Four upstream defects fixed: `ds-tdd` ambiguity, `ds-ledger` tab contradiction, `ds-pr`'s missing
  body file, and `ds-plan-loop` treating a silent critique as a passed one.
- Routing-collision clauses added for `ds-review-loop`/`code-review`, the design/audit cluster, and
  `ds-swarm`/orchestration.

**Aliases**
- Six gesture-only names (`/ds-plan`, `/ds-verify`, `/ds-review`, `/ds-context`, `/ds-best`,
  `/ds-audit`) with `disable-model-invocation: true`: reachable by the `/name` gesture, invisible to
  the model catalog, zero token cost.
- Each declares its target in frontmatter `metadata.aliasOf`; the tooling reads the declaration, not
  the prose.

**Tooling**
- `tools/` — `fetch-upstream`, `build` (validate before swap), `optimize.patch` (one reviewable diff),
  `validate` (DSH contract, alias integrity, drift), `stamp` (bind an install to a build or clean
  checkout), `install` (reconciles removals, verifies what landed), `selftest` (eight gates),
  `conflicts`, `dsh-contract-check` (asserts the installed app still matches the pack's assumptions).
- `--uninstall` verifies a sha256 for **every file** in a skill directory, names a missing file, and
  refuses when an unexpected entry appeared. Older v2 manifests still work.
- CI (`.github/workflows/gates.yml`) runs the gates on every PR and push to `main`.

**Verified**
- 29 skills + 6 aliases byte-identical to the installed root; eighth gate runs the contract checker
  and its self-test.
- `npx skills add Stijnus/deepseek-stack` installs the 29 skills (lock source `Stijnus/deepseek-stack`);
  it does not install the aliases, which need `node tools/install.mjs`.
