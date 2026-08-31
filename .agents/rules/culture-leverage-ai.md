---
title: AI vs Human Ownership
impact: MEDIUM
tags: [culture, ai, review]
---

## What AI Drafts vs What Humans Own

**Impact: MEDIUM**

AI is leveraged for boilerplate and well-patterned work. Humans own anything where a wrong call ships incorrect business behavior, breaks security/payments, or causes data loss.

### Human-owned (AI may suggest, human decides)

- **Auth & session logic** — better-auth config, role/permission boundaries.
- **Payment flows** — anything touching money.
- **Schema changes** — new tables, new constraints, migrations. AI generates; human reviews and applies.
- **Marketplace adapter behavior** — sync semantics, conflict resolution. Wrong = lost orders.
- **Performance-critical paths** — sync workflows, hot query paths.
- **Architectural decisions** — adding a new package, changing dependency direction.

### AI-drafts (human reviews diff)

- **DTOs and Zod schemas** — derive from existing shapes.
- **CRUD tRPC procedures** — follow existing router patterns.
- **UI components** — shadcn primitive composition, dataview cells, form fields.
- **Tests** — assertions over described behavior.
- **Documentation** — READMEs, comments, this rule file.
- **Refactors** — renames, splits, mechanical translations.

### Calibration

When in doubt, draft a small slice, show the user, then expand. Don't ship a 300-line auth or payment change without explicit human review of the *logic*, not just the diff.

(See memory: `feedback_build_properly` — recommend the complete solution; never downscope.)
