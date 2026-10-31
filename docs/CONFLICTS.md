# Routing conflicts — the ds-* pack against the rest of the catalog

Checked against every skill source that can appear in this session's catalog: `~/.agents/skills`
(rank 500), `~/.claude/skills` (rank 900/950), and the `dsh-rev-eng` plugin pack (rank 600).
71 distinct skill names are in play.

Reproduce the mechanical part: `node tools/conflicts.mjs`

## Names: clean

| Check | Result |
|---|---|
| Exact name collisions involving the pack | **none** |
| Any non-`ds-` skill starting with `ds-` | **none** — the namespace is exclusive |
| Alias name colliding with a bundle name | **none** (`ds-plan`, `ds-verify`, `ds-review`, `ds-context`, `ds-best`, `ds-audit` are all free) |
| Shadowing by rank | **none** — nothing outranks `~/.agents` at 500 except project roots, and this project has none |

Pre-existing duplicates that are **not** from this pack: `accessibility`, `code-review`,
`computer-use`, `find-skills`, `orca-cli`, `orchestration`, `playwright-*`, `supabase*`,
`vercel-react-best-practices`, `web-design-guidelines` exist in both `.agents` and `.claude`;
rank 500 wins, by design. `reverse-engineer-anything` is duplicated between `.agents` and the
rev-eng pack. Worth knowing, not caused by this install.

## Triggers: three real clusters — **all three fixed** (see "Applied" below)

Lexical overlap is a weak signal here — the highest description Jaccard between any ds-* skill and
any pre-existing skill is **0.095** (`ds-audit` ↔ `web-design-guidelines`, sharing "audit" and
"design"). The rewritten descriptions use deliberately distinct vocabulary. But a router matches
*intent*, so vocabulary distance does not settle it. Judgment below is on the trigger clauses.

### 1. "Review my change" — HIGH

| Skill | Trigger it claims |
|---|---|
| `code-review` | "review a branch, a PR, work-in-progress changes… 'review since X'" — two axes, parallel sub-agents |
| `ds-review-loop` | "review loop or get it reviewed, or before filing a PR" — author/reviewer convergence, 4 rounds |
| `ds-jury` | "jury, panel review, second opinions" |
| `ds-review` (alias) | inherits `ds-review-loop` |

"Review this PR" and "get it reviewed" match two skills equally. This is the most likely wrong
route in the whole set.

**Suggested fix** — one clause on `ds-review-loop` (~60 chars):
`… Use when the user says review loop or get it reviewed, not for a standards/spec audit — use code-review for "review since X".`

### 2. "Design or audit a UI" — MEDIUM

| Skill | Trigger it claims |
|---|---|
| `ds-design` | new page/screen or restyle — direction note, tokens, states |
| `ds-design-audit` / `ds-audit` | "a page looks generic, cluttered or unfinished" — score, fix, re-score |
| `web-design-guidelines` | "review my UI, audit design, review UX" — compliance checklist |
| `accessibility` | "a11y audit, WCAG compliance" |
| `vibe-to-ui` | designing/restyling UI, inspiration library, design systems |
| `design-kit`, `design-system`, `design-from-app`, `mac-design`, `ux-design` | explicitly **macOS SwiftUI** |

Domain separates the native-Mac skills. It does **not** separate `ds-design` from
`web-design-guidelines`/`vibe-to-ui`, and "audit my UI" is claimed by three skills.

There is also a *behavioural* conflict, not just routing: `ds-design` instructs
`moodboard({ action: "active" })`, while `vibe-to-ui` carries its own inspiration store under
`~/.vibe-to-ui/inspirations`. Loaded together they point at two different style authorities.

**Suggested fix** — state the domain in both descriptions (~45 chars each):
`ds-design`: `…web frontend …`; `ds-design-audit`: `…not a compliance checklist (that is web-design-guidelines) …`

### 3. "Fan work out across agents" — MEDIUM-LOW

| Skill | Trigger it claims |
|---|---|
| `ds-swarm` | "fan out N parallel workers… swarm this, split this across workers" |
| `ds-best-of-n`, `ds-jury` | parallel attempts / parallel reviewers |
| `orchestration` | "multi-agent coordination… task dispatch… decomposing work across agents" — Orca primitives |
| `orca-cli` | Orca worktrees, terminals |

`orchestration` is anchored to Orca, so the clash is smaller than it looks, but its first clause is
broad enough to capture a generic "split this across agents".

## Low or none

- `ds-principles` ↔ `vercel-react-best-practices` / `supabase-postgres-best-practices`: the phrase
  "best practices" overlaps; scope does not (generic engineering vs framework-specific).
- `ds-tdd` / `ds-verify-loop` ↔ `playwright-*` / `test-mac-app`: TDD loop vs browser automation.
- `ds-plan-loop` / `ds-sharpen` ↔ `app-brief` / `user-stories` / `research`: those write
  `docs/BRIEF.md` / `docs/STORIES.md` for macOS apps; domain-separated.
- `ds-help` ↔ `find-skills`: "which skill should I use" is claimed by both; `ds-help` already says
  "deepseek-stack skill", and `find-skills` is about installing new ones. Low.
- No conflict: `ds-mode`, `ds-catchup`, `ds-unslop`, `ds-lessons`, `ds-blast-radius`, `ds-explain`,
  `ds-ledger`, `ds-adopt`, `ds-revive`, `ds-ready`, `ds-ship`, `ds-pr`, `ds-pr-comments`,
  `ds-watch-pr`, `ds-context-reset`, `ds-unstick`, `ds-blueprint`.

## One more name-shape issue (not a collision)

Alias names are valid `/gesture` names but **not** loadable by the `skill` tool — a
`disable-model-invocation` skill throws `skill "ds-plan" is not available for model invocation`.
So `skill({name:"ds-plan"})` fails while `/ds-plan` works. Any subagent told to "load ds-plan"
must be told to load `ds-plan-loop`.


---

## Applied — disambiguation clauses

Fixed in `tools/optimize.patch`, built, and verified live in the session catalog.

| Cluster | Skill | Clause added |
|---|---|---|
| HIGH | `ds-review-loop` | "…Use for 'get it reviewed' before a PR, **not a standards/spec audit — that is code-review**." |
| HIGH | `ds-jury` | "…jury, panel review or second opinions — **different models, not another review pass**." |
| MEDIUM | `ds-design` | "Build a **web** frontend…; **native macOS: design-kit**." |
| MEDIUM | `ds-design-audit` | "…for a **WCAG or guideline audit use accessibility or web-design-guidelines**." |
| MEDIUM-LOW | `ds-swarm` | "…**Orca worktrees: orchestration**." |
| behavioural | `ds-design` body | If `vibe-to-ui` is loaded, the pinned `moodboard` stays the authority; never mix the two palettes. |
| free (0 catalog cost) | `ds-review`, `ds-audit` aliases | Alias text now names what it is **not** — visible in the `/` menu, never in the model catalog. |

Cost: **5,497 → 5,559 chars (+62 chars, ≈17 tokens/session)** for +9/10/22/31/8 characters per
description. All five stay inside the 120-200 character budget (187, 183, 192, 195, 183).

Deliberately not changed: the LOW items. `ds-help` already says "deepseek-stack skill" against
`find-skills` ("discover and install"), and `ds-principles` vs the framework best-practice skills
differ in scope. Adding clauses there would buy little for the tokens.
