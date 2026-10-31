# DSH capability map — abstract skill language → concrete harness tool

The upstream deepseek-stack skills are deliberately harness-neutral. They say things like
"send this to subagents when the harness has them", "wait with the watcher", "ask with the
harness question tool". On a real harness that vagueness is where a cheap model stalls: it
does not know which primitive exists, so it silently skips the step.

This table is the canonical translation. When a skill relies on one of these capabilities,
name the DSH primitive concretely in an `## On DeepSeek Harness` block.

| The skill says (abstract) | DSH primitive (concrete) | Notes |
|---|---|---|
| "subagent", "fresh context worker", "worker" | `subagent` tool | Returns only the child's result, not its intermediate steps. |
| "a subagent that already knows what we have done" | `subagent_fork` | Child is seeded with this conversation's completed turns — the cheapest real review/diff pass. |
| "spawn N workers at once", "run in parallel" | N `subagent` calls **in one assistant message** | They run concurrently. Sequential messages run sequentially. |
| "a subagent with a model setting", "a different provider" | `list_subagent_models` → `subagent({provider, model, reasoning_effort})` | This is how a real multi-model jury happens. Never claim a provider you did not reach. |
| "wide fan-out", "many independent slices" | `workflow` tool | A JS script that fans out subagents with phases and structured results. For dozens of items; overkill for 3. |
| "durable teammate", "unattended long run" | Agent Teams: `spawn_teammate` + shared `team_task_*` tasks | Teammates persist across turns; subagents do not. |
| "wait for the worker / watcher" | `job_output({job_id, wait: true})` | Background bash returns a `job_id`. Never busy-poll with `sleep`. |
| "start the watcher and keep working" | `bash({run_in_background: true})` | Collect every job id before you report. |
| "ask the user" | `ask_user_question` | Real blocking question with options — not a plain message ask. |
| "don't end the turn while checks are pending" | `job_output` with `wait: true` | Also: approval-policy prompts will surface on push/merge. |
| "keep a running record", "PROGRESS.md" | Write `PROGRESS.md` **and** `create_goal`/`update_goal` | A goal survives automatic continuation rounds; the file survives context resets. |
| "track the plan" | `todo_write` | Visible progress, replaces a "plan" paragraph. |
| "load the right instructions" | `skill({name})` | The catalog is summaries only; load before acting. A user-typed `/ds-x` already injected the body — do not re-load it. |
| "design direction", "not the generic AI look" | `moodboard` tool | Pinned references define the project style; call `action: "active"` before any UI work. |
| "the repo's CI / PR bot" | `gh` CLI via `bash` | Present on this machine (`/opt/homebrew/bin/gh`, signed-in check needed). |

## Harness realities the upstream text does not know

1. **Sandbox is `workspace-write`.** Writes outside the session workspace fail closed. Temp
   scratch goes inside the workspace, not `/tmp`.
2. **Approval policy is `ask`.** `git push`, merges, and destructive commands may block on a
   prompt. A skill that promises "unattended merge" (`ds-ship`, `ds-ready`) must expect the
   gate and surface it, not assume it passed.
3. **The catalog is description-only.** DSH renders `name` + a capped `description`. It never
   renders `whenToUse`. Routing quality is therefore entirely a function of the description,
   and every character costs tokens in every session. See `OPTIMIZATION-SPEC.md`.
4. **User gestures `/ds-x` already work.** DSH injects the body when a user message contains a
   whitespace-bounded `/name` matching a user-invocable skill. So a description does not need
   to say "or /ds-verify-loop" — the name is the gesture.
5. **Background jobs and subagents are different budgets.** A subagent returns a report; a
   background job returns stream output you must drain with `job_output`.
