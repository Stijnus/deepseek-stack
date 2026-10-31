---
name: ds-pr-comments
description: "Post attributed, secret-free GitHub comments on the user's behalf with a clear agent note on top. Use whenever you write a PR comment, review reply or dismissal reason."
---

# ds-pr-comments

Make every agent-written comment easy to spot, short and safe to publish.

## Steps

1. Write the reply. Lead with the conclusion. Cite the code line, check, test or reproduction that supports it. Mark what you verified and what is your opinion.
2. Put this note at the top, with the reply below it:

   ```md
   > [!NOTE]
   > **<model> responding on behalf of <user>**

   Reply text starts here.
   ```

   Use the model name the harness reports. If it reports none, use the harness name. Use the user's name or GitHub login.
3. Scan the full comment, including quotes and attachments, for secrets, tokens, private paths and personal data. Remove them.
4. Preview the final Markdown. Confirm the note and the reply render as two separate blocks.
5. Post the comment.
6. Confirm GitHub returned the comment or review URL. Print it.
7. Resolve a review thread only after its reply posted.

## Stop when

- GitHub returned a URL for each comment you meant to post.
- A post fails twice. Report the error and do not resolve the thread.

## Rules

- Use the note on top-level comments, inline review comments, replies to bots and people, and dismissal reasons.
- Do not use it in PR descriptions, commit messages or text the user asked to post word for word.
- One attribution only. No signature, footer, heading or horizontal rule.
- No thanks, filler or status updates such as "still working on it".
- Never guess the model name.

## On DeepSeek Harness

- Posting is `gh` through `bash` (`gh pr comment <n> --body-file <path>`, or `gh api` for an inline
  reply). Write the body file inside the workspace so the exact text you scanned is the text you send.
- In the note, the harness name is DeepSeek Harness. Use the model the session reports, and name
  only the harness when it reports none. Never guess.
- Step 3's scan is a `bash` pass over the file you are about to post. A scan you did not run is not
  a scan.
