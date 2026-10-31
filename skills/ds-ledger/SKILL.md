---
name: ds-ledger
description: "Log one row per decision during long or unattended work and reread the goal row before each step so the run cannot drift. Use for multi-phase or autonomous runs a human reviews later."
---

# ds-ledger

A long run forgets its own reasons. A short written ledger keeps the goal in view and lets a reviewer trust the result.

## Steps

1. Create one TSV file, for example `.ds-ledger.tsv`, with the header `ts	phase	decision	why	evidence	result`. Put the goal and done condition in the first row.
2. Before each step, re-read the goal row and the last ten rows. Check that the next step still serves the goal. If it does not, log the drift and correct course.
3. After each real decision, append one row:
   - ts: ISO 8601 time.
   - phase: the phase or workstream.
   - decision: what you chose or did, one line.
   - why: the reason in plain words.
   - evidence: a pointer, never prose. A commit hash, `file:line`, a command and its result, or an artifact path.
   - result: the outcome, such as "tests pass", "reverted", "open".
4. Keep each cell on one line. The tab is the separator, so a cell must not contain one.
5. Log reverts and dropped work too, with the reason. Failures are the most useful rows.
6. At the end, add a summary row and point the user to the file. Commit it only if a reviewer needs it.

## Stop when

- The run ends and the summary row is written.
- If three rows in a row show no progress toward the goal, stop the run and report.

## Rules

- Every row needs evidence you can open or rerun. "Looked fine" is not evidence.
- Write rows the way you would tell a teammate, plain and concrete.
- Do not rewrite old rows. Append corrections.

## On DeepSeek Harness

- The ledger is a plain TSV: append rows with `bash` (`printf '...\n' >> .ds-ledger.tsv`) so every cell
  stays one line and no tool reflows it.
- An unattended run that must outlive a context reset: `create_goal` for the objective plus the ledger
  file for the reasons. The goal survives continuation rounds; the file survives resets.
- Evidence pointers for background work are job ids: `bash({ run_in_background: true })` returns one,
  and the row records it; drain with `job_output({ job_id, wait: true })` before claiming a result.
- "Three rows with no progress" is a stop for the run, not a nudge: report and end the turn.
