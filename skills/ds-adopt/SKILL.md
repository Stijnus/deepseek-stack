---
name: ds-adopt
description: "Take over someone else's PR, branch or agent thread, finish its original goal and keep their credit. Use for 'take over', 'adopt' or 'finish this PR'."
---

# ds-adopt

Finish someone else's work as if it were yours, but credit them for what they did.

## Steps

1. Read the source PR, branch or thread in full: description, commits, review comments and any later corrections from the user.
2. Find the real current state: the head SHA, uncommitted changes and open review findings. Treat the handoff notes as hints, not facts.
3. Write down the original goal in one sentence.
4. Choose where to work. By default, make a new branch with the original commits on it and add your fixes as separate commits. Continue in place or stack only if the user asked for it.
5. Run `ds-revive` to bring the work up to date with the base branch.
6. Fix what is needed to reach the original goal. Simplify where you can, but keep every intended behavior.
7. Verify on your own. Reproduce the original problem, then show it fixed. Run the real workflow, not only mocked tests. Record the commands and output.
8. Check the source PR again. It may have changed while you worked.
9. If a PR is wanted, file it with `ds-pr`, then watch it with `ds-watch-pr`. Use `ds-pr-comments` for any reply.
10. Report what you inherited, what you changed, how you verified it, how credit was kept and what is still open.

## Stop when

- The goal is reached, verified and reported.
- The goal is unclear, or finishing it needs a product decision. Ask the user.
- Verification fails three times in a row on the same issue. Report the blocker.

## Rules

- Keep the original Git authors and co-author trailers. Name the contributors and link the original PR in the description.
- If the PR will be squashed, keep human co-author lines in the squash message. Use verified identities only, never guessed emails.
- Do not defend the old code because it exists. Do not add unrelated features.
- Do not edit, merge or close the original PR without permission.
- State plainly what you could not verify.

## On DeepSeek Harness

- Step 1 and step 8 are `gh` through `bash` (`gh pr view`, `gh pr diff`, `gh pr checks`). The handoff
  notes are hints; the API is the current state.
- A takeover that runs unattended: `create_goal` at the start and `update_goal` at each
  milestone, with `PROGRESS.md` carrying what the goal record cannot.
- Step 7's verification is `bash` output, command by command. A claim without one is not the check
  step 7 asks for.
- Filing and watching stay `ds-pr` and `ds-watch-pr`. Their DSH sections own the push gate and the
  watcher job, so this skill adds nothing there.
