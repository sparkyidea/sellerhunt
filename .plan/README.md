# .plan — work in flight

One folder per unit of work. **Each folder is deleted by the PR that ships it.**

```
.plan/<slug>/
  00-overview.md    goal · non-goals · done-when · files touched · conflicts
  01-*.md …         steps, one per reviewable chunk
```

## This is not the backlog

The backlog is **GitHub Issues**. A checked-in queue file conflicts on every
branch, so it stops getting updated, so it starts lying. We had one; it was four
months stale and half its "open" items had already shipped.

`ls .plan/` is the index. Nothing else.

## The rules

**Create the folder on the branch, never on `main`.** That's what makes parallel
worktrees safe — two branches never touch the same path, so plan files cannot
conflict. Structurally, not by discipline.

**One slug = one branch = one worktree = one PR.**

**Delete the folder in the PR that ships the work.** A plan file that outlives
its PR is a bug. `.plan/` on `main` should trend toward empty; if it grows, work
is shipping without cleanup.

**Durable findings move to [`.domain/`](../.domain/), not into a plan file that
lingers.** If the plan taught you something true about the product, that fact
belongs in `.domain/` before the plan is deleted. Decisions with a real
alternative get an ADR.

## The loop

1. **Capture** → GitHub Issue
2. **Shape** → touch `.domain/` first. Can't name the entity, flow, or invariant
   that changes? Not ready to plan.
3. **Plan** → new worktree + branch, write `.plan/<slug>/`
4. **Build** → in that worktree only
5. **Land** → PR = code **+** `.domain/` update **+** `rm -r .plan/<slug>/`
6. **Decide** → real alternative considered? Add `.domain/decisions/NNNN-*.md`

## Currently in flight

| Slug | What | Status |
| --- | --- | --- |
| `clean-break-initial-sync/` | Wipe + rollout runbook for the initial-sync rework | **User-executed.** Wipe must run BEFORE migration `0004`. Never run by an agent. See [ADR 0004](../.domain/decisions/0004-clean-break-initial-sync.md). |
| `outbox-listings/` | Price + quantity write-back through the outbox | Not started. Second worked example of the four-piece pattern after shipments. |
