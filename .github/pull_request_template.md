## What & why

<!-- What changes, and what problem it solves. Link the issue: Closes #NNN -->

## Domain traceability

<!-- See .domain/README.md. Tick or strike through with a reason — don't delete. -->

**Rule ids affected:** <!-- e.g. INV-003, SYN-005 — or "none" -->

- [ ] **Rule updated** — if this changes behaviour a rule describes, the rule
      changed here first, and its `tests:` still prove it.
- [ ] **New invariant → new rule** — if this adds an invariant, it has an id in
      `.domain/<domain>/rules.md`, not just a code comment.
- [ ] **Domain gates pass locally** — `bun .github/scripts/check-domain.ts` and
      `bun .github/scripts/check-domain-coverage.ts`.
- [ ] **`.domain/` updated** — this change makes something in `.domain/` true or
      false, and I fixed it here rather than in a follow-up PR. *(R1)*
      <!-- Struck through? Say why: pure refactor, no behaviour change, etc. -->
- [ ] **`.plan/<slug>/` deleted** — the plan folder for this work is removed in
      this PR. *(R2)*
      <!-- No plan folder? Strike through. -->
- [ ] **ADR added** — this involved a decision with a real alternative, so
      `.domain/decisions/NNNN-*.md` records it.
      <!-- No real alternative? Strike through. -->

## Verification

<!-- What you actually ran/saw. Not what should work. -->

- [ ] `bun check-types`
- [ ] `bun x ultracite check`
- [ ] Tests pass

## Schema changes

<!-- Delete this section if none. -->

- [ ] Migration generated with `bun db:generate` and **not applied** — awaiting
      user approval to run push/migrate.
