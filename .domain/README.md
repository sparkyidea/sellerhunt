# .domain — what we are building, and why

Durable truth about dashseller, organized by **business domain**, not by code
architecture. Lives until the product changes, not until the current task ends.

Models are disposable. This is not.

---

## Priority of truth

When sources disagree, this is the order:

| # | Source                        | Where                                          |
| - | ----------------------------- | ---------------------------------------------- |
| 1 | **Domain rules**              | `.domain/<domain>/rules.md` — the `XXX-NNN` set |
| 2 | **Architecture decisions**    | `.domain/decisions/NNNN-*.md`                   |
| 3 | **Automated tests**           | the `tests:` paths each rule cites              |
| 4 | **Application code**          | `apps/`, `packages/`                            |
| 5 | **Prose docs and examples**   | everything else here                            |

**If sources disagree, do not invent a resolution. Flag the conflict.**

A rule contradicting the code means one of them is a bug, and which one it is is
a decision for a human. Silently picking the code (because it runs) or the rule
(because it's written down) destroys the signal. Say plainly: *"`INV-003` says
bounds, `inventory.ts:88` compares a single timestamp — which is right?"*

Prose is last on purpose. It's the easiest to write and the easiest to leave
stale, so it never overrides a rule, a decision, or a test.

---

## Three context directories, split by lifetime

| Directory  | Lives for                 | Answers                          |
| ---------- | ------------------------- | -------------------------------- |
| `.agents/` | until conventions change  | *How do we write code here?*     |
| `.domain/` | until the product changes | *What are we building, and why?* |
| `.plan/`   | **one PR**                | *What am I building right now?*  |

---

## Bounded contexts

Each owns a permanent rule-ID prefix. Prefixes are never reassigned.

| Domain          | Prefix | Covers                                                     |
| --------------- | ------ | ---------------------------------------------------------- |
| `tenancy/`      | `TEN`  | organization as tenant, isolation, attribution              |
| `catalog/`      | `CAT`  | product, variant, warehouse, category taxonomy              |
| `channels/`     | `CHN`  | marketplace connections, OAuth, webhooks — plus per-vendor behaviour |
| `listings/`     | `LST`  | listings and the channel↔catalog join                       |
| `orders/`       | `ORD`  | orders, lines, relink, windowed pulls                       |
| `inventory/`    | `INV`  | stock semantics, seeding, the baseline rule                 |
| `fulfillment/`  | `FUL`  | shipments, correlation, tracking                            |
| `sync/`         | `SYN`  | the outbox write path and pull sequencing                   |

Supporting, not bounded contexts:

| Folder       | Holds                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| `decisions/` | ADRs. Dated, immutable, why + what we rejected.                        |
| `platform/`  | Generic mechanism with no domain semantics: search, dataview validation.|
| `research/`  | External input. Competitor teardowns, vendor policies. Not our design. |
| `product.md` | What dashseller is, and the constraints that shape feature decisions.  |
| `glossary.md`| **Disambiguation only.** Terms whose confusion spans domains, each pointing at the rule that defines it. Not a definitions dump. |

**Why `sync/` is a bounded context and `platform/` isn't.** Sync is a business
capability — it's job #1 of the four in `product.md`, and it has invariants the
business cares about. Search and dataview are infrastructure: swap them out and
the domain is unchanged.

---

## What each domain answers

1. **What are the entities?** → `concepts.md`, or the schema itself
2. **What do the terms mean?** → the domain's own pages. `glossary.md` only
   carries terms whose confusion is *between* domains — product variant vs
   listing variant, shipment vs fulfillment — because those can't live in one.
3. **What must always be true?** → `rules.md` ← *the load-bearing one*
4. **What transitions are allowed?** → `concepts.md` / the relevant ADR
5. **What are representative examples?** → the `tests:` each rule cites

Point 5 is deliberate: **examples are tests.** A hand-written YAML lifecycle
drifts from the code the day it's committed. A test that cites a rule id is an
example that CI keeps honest.

---

## Rules

Every invariant has a permanent ID (`INV-003`, `FUL-002`) referenced by code
comments, tests, commit messages, and PRs. Format and fields:
[`_template/rules.md`](_template/rules.md).

```bash
# ids unique, cited paths exist, critical rules tested, and no source file
# references a rule that no longer exists
bun .github/scripts/check-domain.ts

# guarded code changed => diff cites a rule id or edits rules.md
bun .github/scripts/check-domain-coverage.ts
```

Both run in CI as the `domain` job.

**IDs are permanent.** Never renumber, never reuse a retired one — code
references them. A rule that stops being true gets `status: retired` and a note
saying what replaced it.

**`status` is a claim about reality, not an aspiration.** `enforced` means true
today *and* cited by a test. If a critical rule has no test, `check-domain.ts`
fails — downgrade it to `advisory` and say why it can't be tested, rather than
pretending. Two rules are `advisory` today for exactly that reason.

---

## Knowledge vs live state

**Knowledge** — *What does `past_due` mean? When can a shipment be voided? Who
can cancel an organization?* Versioned here.

**Live state** — *What plan is Acme on? Has invoice 123 been paid? How many
seats does org 456 have?* Never written here. It's reached through tRPC
procedures and DB queries, and it is stale the moment it's typed into a file.

A doc that names a specific customer, order, or channel has crossed the line.

---

## Writing an ADR

One file per decision that had a real alternative. Skip it if there was only ever
one option.

```
.domain/decisions/NNNN-<kebab-slug>.md
```

```markdown
# NNNN — <decision in the imperative>

- **Status:** Accepted | Superseded by NNNN | Reversed
- **Date:** YYYY-MM-DD

## Context
What forced a choice. The constraint, not the backstory.

## Decision
What we do now. Present tense.

## Alternatives rejected
Each with the reason. This is the section future-you actually reads.

## Consequences
What this costs us, what it forecloses, what now has to stay true.
```

Sequential numbering, never reused. **Immutable once shipped** — supersede,
never edit. The record of what we believed *then* is the value.

---

## The rules of this directory

**R1 — Docs change in the PR that makes them true.** Never a follow-up doc PR;
those never get written.

**R2 — A plan file that outlives its PR is a bug.** `.plan/<slug>/` is deleted by
the PR that ships it.

**R3 — One fact, one home.** About to copy a paragraph between `.agents/` and
`.domain/`? Link instead. A fact stated twice becomes a fact that disagrees with
itself.

**R4 — Write what code can't say.** Skip anything derivable from the schema, the
types, or `git log`. Write the *why*, the invariant, the gotcha.

**R4a — The glossary points, it does not define.** One line plus a rule
reference. A second paragraph means the content belongs in that domain's
`rules.md` or `concepts.md`. `check-domain.ts` validates every rule id cited
anywhere in `.domain/`, so a pointer to a renamed rule fails CI.

**R5 — Decisions are immutable.** Supersede, don't edit.

**R6 — Flag conflicts, never resolve them silently.** See *Priority of truth*.

---

## Not yet: an MCP knowledge server

The obvious next step is exposing this over MCP (`domain://inventory/rules`,
`get_business_rule("INV-003")`, `search_domain(query)`) so non-repo agents —
support bots, QA agents, another repo — read the same brain.

**Not worth building yet.** One repo, and every consumer already has filesystem
access. It would be a second copy of a thing that works.

**Build it when** a second repository needs these rules, or a non-coding agent
that can't clone the repo does.

The structure is already MCP-shaped, so that stays cheap: rule IDs are stable
addresses, `check-domain.ts` is the validation a server would need anyway, and
the fenced-yaml blocks parse into resources without reformatting. Whatever gets
built is an *index* over this directory — never a second source of truth.
