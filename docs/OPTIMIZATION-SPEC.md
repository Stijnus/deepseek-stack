# Optimization spec — deepseek-stack → DSH-native skills

Every skill passes three edits. Change nothing else.

## 1. Frontmatter — exactly two keys

```yaml
---
name: ds-verify-loop          # unchanged, kebab-case, must match the directory
description: "..."            # rewritten, see below
---
```

- Keep `name` **byte-identical** to the directory name (`ds-watch-pr` is the one exception that
  already has a second key — reduce it to `name` + `description`).
- `whenToUse` is **forbidden**: DSH parses it but never renders it, and routing reads the
  description only. Adding it is dead weight.
- `allowed-tools`, `license`, `model`, and any other key: delete. DSH's local provider drops
  unknown frontmatter keys; the Claude-compat plugin would only file them as metadata.
- `disable-model-invocation` / `user-invocable` are valid DSH keys but do not add them unless
  the skill is genuinely manual-only.

### Description rules

The description is the entire routing signal **and** it sits in a durable catalog message in
every session, so it is read on every turn. Optimize for both jobs.

- **Budget: 120–200 characters.** Hard DSH cap is 500 (silently truncated); staying near the
  bottom of that range is the point.
- Lead with the action verb, then the situation. Pattern:
  `<What it does in one clause>. Use when <2–4 concrete triggers>, or when <syndrome>.`
- Keep every trigger phrase that a user might actually type ("ship it", "jury", "unstick").
- **Delete the self-reference**: no `Invoke as /ds-x`, no `or when the user types /ds-mode`.
  The skill's name *is* the `/name` gesture — DSH matches `/ds-verify-loop` to
  `ds-verify-loop` by name. Those clauses buy nothing and cost tokens.
- No backticks around the name, no markdown, one line.
- Front-load the distinguishing words: a cheap model scanning 80 catalog lines routes on the
  first ~10 tokens.

## 2. Body — preserve, then bind to DSH

- Keep the upstream structure, headings, numbered steps, stop-conditions and rules. They are
  the value of the pack. Do **not** rewrite a skill into your own voice.
- Tighten only where the text is padded: drop hedges and repeated phrasing, keep every
  concrete instruction, number, and cap (e.g. "max 5 rounds", "six fix-and-watch cycles").
- Keep `# <name>` as the body's first line.
- Keep cross-references to other `ds-*` skills exactly as written.
- Delete lines that exist only to restate the skill's own name.

## 3. Add `## On DeepSeek Harness` — only where it earns its place

Append this section **at the end of the file** when the skill depends on a capability that has
a concrete DSH primitive (subagent, parallel fan-out, second model, background job, question,
goal, design references, `gh`). Read `docs/DSH-MAPPING.md` for the authoritative mapping.

Format — 3 to 6 bullets, no prose:

```markdown
## On DeepSeek Harness

- Reviewers: `subagent_fork` (it already has the diff's history) — one call per reviewer, all
  in the same message so they run in parallel.
- Second model: `list_subagent_models`, then `subagent({provider, model})`. If only one
  provider is reachable, say so and use two fresh `subagent` calls with different personas.
- Waiting is `job_output({wait: true})`, not `sleep`.
```

Rules:

- Always the same heading text: `## On DeepSeek Harness`.
- Name real tools with real argument shapes. Never invent a tool or an argument.
- Do **not** restate the general mapping table — only what this specific skill needs.
- **Omit the section entirely** if the skill needs no DSH-specific primitive (e.g. `ds-unslop`,
  `ds-principles`, `ds-explain`). An empty or generic block is worse than none.
- Do not mention Claude Code, Codex, Cursor or any other harness as an assumption. DSH is the
  named target; "any harness" phrasing elsewhere in the body is fine and stays.

## Don'ts

- Do not rename skills, merge skills, add files, or add scripts.
- Do not weaken a check, cap, or "stop when" condition to make a skill sound nicer.
- Do not turn a model-agnostic instruction into a DSH-only one unless the DSH primitive is
  strictly better; "read the failing code" has no tool and needs none.
- Do not add a "Requirements" or "Install" section — installation is the pack's job.

## Reference

`skills/ds-verify-loop/SKILL.md` and `skills/ds-help/SKILL.md` are the worked exemplars.
Match their density and tone.
