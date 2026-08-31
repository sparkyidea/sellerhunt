---
title: PR Creation Rules
impact: HIGH
tags: [ci, pr, workflow, conventional-commits]
---

## PR Creation

**Impact: HIGH**

### Size cap

- **<500 LOC** of changed code per PR.
- **<10 code files** (lockfiles, generated files, and docs do not count).

If a change exceeds this, split. Common split strategies:

1. **By layer** — schema migration → backend (router + service) → frontend (UI consuming the new endpoint). Each lands separately.
2. **By dependency order** — shared utility / type first, then call sites.
3. **By feature flag** — land disabled behind a flag, then enable in a follow-up.

A larger PR is acceptable only when splitting would create broken intermediate states (e.g., a refactor that renames a symbol everywhere).

### Conventional Commits

PR titles and commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `perf:`
- Optional scope: `feat(api):`, `fix(dataview):`, `chore(db):`.

### Draft by default

Open new PRs as drafts. Mark ready-for-review only when:

- Local checks pass (see `ci-local-checks.md`).
- Self-review of the diff is complete.
- The description includes summary + test plan.

### Never

- Force-push to shared branches (`main`, `dev`).
- Commit `.env`, secrets, or credentials.
- Skip hooks (`--no-verify`) without explicit user approval.
- Bundle unrelated changes — open separate PRs.
