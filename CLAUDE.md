<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## PR & merge workflow

This repo is developed from a git worktree while `main` stays checked out in the
primary worktree. When asked to "pr and merge", run the whole flow without
pausing to ask, and account for the environment:

- Run every `gh` command (and any network git op) with the sandbox disabled from
  the first attempt. In-sandbox, `gh` fails with a TLS cert error
  (`x509: OSStatus -26276`) — don't waste a sandboxed try first.
- `git push` works in-sandbox but logs a harmless
  `could not write config file .git/config: Operation not permitted` when setting
  upstream. The push still landed; ignore it.
- `gh pr merge --delete-branch` fails its *local* cleanup
  (`'main' is already used by worktree`) even though the **remote merge
  succeeded**. Don't retry the merge. Verify with
  `gh pr view <n> --json state,mergeCommit`, then delete the remote branch
  separately with `git push origin --delete <branch>`. Leave the local branch
  for the user to drop from the main worktree.
- Happy path: `git commit` → `git push` (sandbox ok) → `gh pr create`
  (sandbox off) → `gh pr merge <n> --squash` (sandbox off) → verify state →
  `git push origin --delete <branch>` (sandbox off).
