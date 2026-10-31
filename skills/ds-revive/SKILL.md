---
name: ds-revive
description: "Bring a stale PR up to date: check the idea still fits, then rebase, rework or recommend closing it. Use for 'rebase this', 'refresh' or 'revive an old PR'."
---

# ds-revive

Update the idea, not only the branch. A clean rebase does not prove the PR still belongs.

## Steps

1. Fetch the latest base, the PR head and any related branches.
2. Record the PR URL, state, base, head branch, head SHA, author, checks and review state. Read the title, body, linked issues, commits, threads and full diff.
3. Write the PR's goal in one sentence.
4. Find the merge base. Read what landed on the base branch since then. Search merged and open PRs for the same problem.
5. Answer each question with evidence (commit, PR or file path):
   - Has this problem already been solved?
   - Did the APIs, types, schemas or structure it relies on change?
   - Was the code it edits moved, deleted or simplified?
   - Would landing it bring back old behavior or make two ways to do one thing?
   - Is the benefit still worth the upkeep?
6. Pick one verdict:
   - **REVIVE**: goal and shape still fit. Go to step 7.
   - **REWORK**: goal fits, shape does not. Describe the smallest rewrite and stop, unless the user also asked for the rework.
   - **CLOSE**: superseded or no longer worth it. Cite the evidence and stop. Do not close it yourself.
7. For REVIVE: work in a clean worktree at the recorded head. Rebase onto the fresh base. Resolve conflicts by the PR's goal and the base's newer rules.
8. Run `git range-diff` on the old and new series. Confirm no intended change was lost and nothing already landed came back.
9. Run the focused checks for the touched area. Mark each failure as real, pre-existing or infrastructure.
10. Push with `--force-with-lease=<branch>:<old head SHA>`.
11. Report the verdict first, then base changes, conflicts, push result, checks and the remaining decision with the PR link.

## Stop when

- The report is written after any of the three verdicts.
- A conflict shows a product or design disagreement. Stop and reconsider the verdict.
- The lease fails. Fetch again and redo steps 4 to 6 once. If it fails again, report.

## Rules

- Treat a dirty worktree as the user's. Never stash or discard it.
- Never merge, close or change the base branch. Never force-push without a lease.
- No conflicts in Git does not mean the PR is current.
- Separate facts you checked from your judgment.
- Post PR comments only when asked, through `ds-pr-comments`.

## On DeepSeek Harness

- Steps 1 to 4 read state through `bash`: `git fetch`, `gh pr view <pr>`, `gh pr diff`,
  `git range-diff`, `gh pr list --search`.
- The step 7 worktree goes inside the session workspace. Writes outside it fail closed, so a
  worktree under a temp directory outside the workspace will not work.
- The step 10 lease push can stop on the approval gate, and a prompt is not a failed lease. Report
  the gate and the lease failure as separate facts.
- Step 9's checks are `bash` runs; label each failure real, pre-existing or infrastructure from
  the output, not from the branch name.
