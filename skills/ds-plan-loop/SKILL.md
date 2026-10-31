---
name: ds-plan-loop
description: "Plan in numbered steps, each with an acceptance check, critique the plan once in a fresh pass, then build one step at a time. Use when a task spans several files or scope is unclear."
---

# ds-plan-loop

Plan before coding, check the plan once, then build the task one verified step at a time.

## Steps

1. Restate the goal in one sentence. List the files and commands you expect to touch. Read those files before you plan. Do not plan from memory.
2. Write a numbered plan. Each step gets one action and one acceptance check that a command or a direct observation can confirm, for example "`npm test -- auth` passes" or "`GET /health` returns 200". Keep each step small enough to verify in a single diff.
3. Write the plan to a file (PLAN.md, or the PROGRESS.md from ds-context-reset) so later steps and fresh sessions can read it.
4. Critique the plan in a fresh pass. Reread only the goal and the plan, as a reviewer who did not write it. If you can, run the critique in a subagent or new session. Answer three questions:
   - Which step is missing (setup, migration, config, tests, cleanup)?
   - Which assumption has not been checked against the code or docs?
   - Is there a simpler path that reaches the same goal with fewer steps?
5. Revise the plan. Check each risky assumption now by reading code or running a command. Do not carry it forward as a guess.
6. Execute step 1 only. Run its acceptance check and read the real output. Use ds-verify-loop when the check fails.
7. Mark the step done in the plan file, along with the evidence (command and result). Then move to the next step.
8. If a step shows that the plan is wrong, stop and revise the remaining steps before continuing. Do not improvise around it.

## Stop when

- Every step is marked done and its check passed, and the original goal holds when you check it end to end.
- You have done 2 critique rounds. A third round almost never finds anything new, so execute.
- A step fails its check twice in a row. Switch to ds-unstick.

## Rules

- No step without a check. "Looks right" is not a check.
- Do one step per diff. Do not batch steps to save time.
- Do not add steps that the goal does not need.
- Keep the plan short: about 3-10 steps. Split bigger work into separate plans.

## On DeepSeek Harness

- The plan in step 2 is `todo_write`: one todo per step, the acceptance check in the text. A PLAN.md is
  still what survives a context reset, so write both when the task will outlive the session.
- Step 4's fresh pass: `subagent_fork` critiques with the conversation in hand; a plain `subagent`
  reviews with no memory of your reasoning. Either returns only the critique, so ask for the three
  answers explicitly.
- A review call that returns nothing — no critique and no error — is a failed step, not a pass.
  Re-run it once; if it is still empty, do the three answers yourself and write in the plan that
  you did. Never report the critique as done because the call was dispatched.
- A plan that must survive automatic continuation rounds: `create_goal` with the one-sentence goal from
  step 1, then `update_goal` as steps land. The goal keeps the run going; the file keeps the detail.
- Acceptance checks are `bash` commands. Keep each command string identical between the plan and the
  proof, so "passed" means the same thing when you report it.
