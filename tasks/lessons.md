# Lessons

## Git: integrating a feature branch (PR & merge)

**Mistake (2026-06-06):** Before opening PR #8 I ran `git merge origin/main`
*into* the feature branch to pick up new main commits, then merged the PR with
`gh pr merge --merge`. This produced a nested merge node (`Merge origin/main`)
*inside* the PR merge commit — two overlapping merge commits, an ugly history.

**Rule — rebase, never merge-into-branch:**
- To pick up new `main` commits on a feature branch, **rebase the branch onto
  `origin/main`** (`git rebase origin/main`, or cherry-pick the commits onto a
  fresh branch off main). NEVER `git merge origin/main` into the branch — that
  creates an internal merge node that then gets wrapped by the PR merge commit.
- Then integrate per size (global CLAUDE.md):
  - **Bigger curated work** (a few individually-meaningful, bisectable commits)
    → keep **one** merge commit on top of current `main` (`--no-ff`). Shape:
    `main ← [feat A, feat B] ←┐ merge`.
  - **Small/scrappy work** → `gh pr merge --squash` (project CLAUDE.md happy path),
    one clean Conventional Commit, no merge node.
- "Commit as you go" still applies: build the branch as a few atomic commits;
  don't collapse genuinely curated work into one squash.

**Fixing a botched history:** rebuild on a temp branch off real `main`
(cherry-pick the original commits, reuse the validated merge's conflict
resolution via `git checkout <merge> -- <file>`), verify the tree is identical
to the known-good state (`git diff <goodref> HEAD` empty), then
`git push origin HEAD:main --force-with-lease=main:<oldsha>`. After rewriting a
branch others may have checked out (e.g. the primary worktree's `main`), they
must `git fetch && git reset --hard origin/main` — a plain pull won't fast-forward.
