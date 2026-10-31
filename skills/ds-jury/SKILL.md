---
name: ds-jury
description: "Put a change in front of two or three independent models and loop on fixes until they agree. Use for jury, panel review or second opinions — different models, not another review pass."
---

# ds-jury

Get two or three independent reviewers to judge the same change, then fix until they agree.

## Steps

1. Get the work ready first. Answer open PR comments, fix known issues and run the relevant checks. Skip this only if the user wants to throw the code away.
2. Pick the jurors. Use models the user named. Otherwise pick the strongest available model from two or three different providers, at high reasoning effort.
3. Reach them in this harness: `list_subagent_models`, then one `subagent({provider, model, reasoning_effort})` per juror. Fall back to a second agent CLI in the terminal, or an API call. If only one model is available, start two or three fresh-context subagents of that model, each with a different persona: correctness, security and edge cases, simplicity and scope.
4. Write one brief for all jurors: repo path, base SHA, diff command, goal in one sentence, out-of-scope items and check results. Tell them to review only and change nothing.
5. Ask each juror for: a verdict (APPROVE or CHANGES), a score out of 10 and findings as `id severity file:line claim fix`. Severity is blocker, should or nit.
6. Run the jurors in parallel. Wait for all of them. A timeout or error is not approval.
7. Check each finding against the code yourself. Fix the ones you agree with, with the smallest change. Write a one-line reason for each one you reject.
8. Re-run checks. Start a new round with the same brief, your answers and the new diff.
9. Report the result. If there is a PR, edit its description and add a table: juror, model, score per round. Write `no score` when a juror gave none. If there is no PR, put the table in your final reply.

## Stop when

- Every juror returns APPROVE with no open blocker or should finding.
- Three rounds are done. Report the open disagreements, with both sides in two lines each. The user decides.
- A round returns only nits. Stop without another round.

## Rules

- Jurors are read-only. They do not edit, push, comment or start their own subagents.
- Say which jurors are the same model as each other. Do not claim a provider you did not reach.
- Never invent a score or verdict.
- Guard the scope. Decline new features and list them as follow-ups.

## On DeepSeek Harness

- Step 2's "different providers" starts with `list_subagent_models`: only routes it returns are
  claimable. A provider you did not call is a provider you must not name.
- Each juror is `subagent({ provider, model, reasoning_effort })`. Same provider and model twice is a
  persona, not a juror — say which jurors are the same model (step 9).
- All jurors go in ONE assistant message, N `subagent` calls. Sequential messages run them one after
  another and turn the jury into a queue; step 6's parallel requirement is that message boundary.
- One provider reachable: say it plainly, then run the step-3 personas as three fresh `subagent` calls.
- `workflow` is for a dozen or more independent slices. Three jurors do not justify it.
