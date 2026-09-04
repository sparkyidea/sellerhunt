# .plan — work in flight

One folder per unit of work. **Each folder is deleted by the PR that ships it.**

```
.plan/<slug>/
  00-overview.md    goal · non-goals · done-when · files touched · conflicts
  01-*.md …         steps, one per reviewable chunk
```

## This is not the backlog

The backlog is **GitHub Issues**. A checked-in queue file conflicts on every
branch, so it stops getting updated, so it starts lying.

`ls .plan/` is the index. Nothing else.

## The rules

**Create the folder on the branch, never on `main`.** That's what makes parallel
worktrees safe — two branches never touch the same path, so plan files cannot
conflict. Structurally, not by discipline.

**One slug = one branch = one worktree = one PR.**

**Delete the folder in the PR that ships the work.** A plan file that outlives
its PR is a bug. `.plan/` on `main` should trend toward empty; if it grows, work
is shipping without cleanup.

## The loop

1. **Capture** → GitHub Issue.
2. **Plan** → new branch, write `.plan/<slug>/`.
3. **Build** → on that branch only.
4. **Land** → PR = code **+** `rm -r .plan/<slug>/`.

## Currently in flight

_None._
