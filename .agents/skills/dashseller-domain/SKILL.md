---
name: dashseller-domain
description: Use when writing, changing, or retiring domain knowledge in `.domain/` — adding a business rule, writing an ADR, documenting an invariant or marketplace behaviour, or deciding where a fact belongs. Triggers on "domain rule", "invariant", "business rule", "ADR", "architecture decision", "rule id", "INV-", "FUL-", "SYN-", "CHN-", "ORD-", "CAT-", "LST-", "TEN-", or any edit under `.domain/`.
---

# Writing domain knowledge

This is the **judgment**. Format lives in `.domain/_template/rules.md`; structure
and R1–R6 live in `.domain/README.md`. Don't restate either — link.

## 1. Is this a rule at all?

The failure mode is rule-bloat: `rules.md` fills with restated implementation and
stops carrying signal. Four tests — a real rule passes all four.

- **Would a competent engineer plausibly do the opposite?** If nobody would ever
  violate it, it doesn't need an id.
- **Can you name the concrete failure it prevents?** "Oversell → cancelled order →
  defect rate → suspended account" is a rule. "Keeps things consistent" is an
  observation.
- **Would it survive a rewrite in another language?** If yes it's an invariant. If
  it's "how this function currently works", it's a code comment.
- **Is it already enforced by a type, FK, or unique index?** Then the schema is
  the rule. Write it down only if the *reason* is non-obvious — see `INV-006`,
  which exists because the app-side consequence isn't derivable from the index.

Not a rule? It's still worth writing — just somewhere else.

## 2. Where does this fact go?

One fact, one home (R3). Six destinations:

| The fact is… | Home |
| --- | --- |
| an invariant that must always hold | `<domain>/rules.md` — gets an id |
| why we chose X when Y was viable | `decisions/NNNN-*.md` |
| what an entity *is*, how it relates, its lifecycle | `<domain>/concepts.md` |
| a term confused **across** domains | `glossary.md` — one line + pointer, never a definition |
| a vendor's word → our model | `channels/terminology.md` |
| how a vendor's API actually behaves vs its docs | `channels/<vendor>.md` |
| how we write code here (layering, style, lint) | `.agents/rules/` — not `.domain/` |
| what a specific customer/order/channel *currently is* | nowhere. That's live state, reached through tRPC |

## 3. Severity and status, honestly

`severity` is blast radius if violated, not how much you care:
`critical` = data corruption, money, or account risk · `high` = user-visible wrong
· `medium` = friction.

`status` is **a claim about reality, not an aspiration.** `enforced` means true
today *and* cited by a test.

`check-domain.ts` fails on `critical` + `enforced` with no test. **Do not dodge
that by downgrading severity** — a critical rule doesn't stop being critical
because it's hard to test. Downgrade *status* to `advisory` and say why in the
rule body. `CHN-001` does this: the failure lands at a marketplace's token
endpoint hours after deploy, so no local test reproduces it.

## 4. Citing `code:` and `tests:` — verify, don't guess

**This is where rules go wrong most often.** `check-domain.ts` verifies a cited path
*exists*. It cannot verify the path is *right*. Nothing catches a plausible-but-
wrong citation except opening the file.

Both of these shipped wrong and were caught only by reading the code:

- `SYN-006` cited `packages/sync/src/orders/sync-channel-orders.ts` — that file
  *mentions* the chained pull, but the dedup id it's about lives in
  `apps/worker/src/processors/listings.ts`.
- `FUL-005` cited only `outbox/reconciliation.ts`, which implements 2 of the
  ladder's 4 rungs. The type is in `db/src/schema/sync-outbox.ts` and `remote_id`
  is applied in `outbox/fenced.ts`.

So: **open every file you cite and confirm it implements that specific rule.** If
several files share the invariant, cite them all. Then add the citation *in* the
code — attach `Rule: XXX-NNN` to the existing docblock rather than writing a new
comment beside it.

`tests:` means "what fails if this breaks", not "tests near this code".

## 5. Changing an existing rule

- **Never edit a rule to match code you just wrote.** If the implementation
  violates a rule, the implementation is wrong until a human says otherwise. Stop
  and report both sides (R6).
- **Never renumber or reuse an id.** Source files reference them.
- **Retire, don't delete.** `status: retired` plus a note saying what replaced it.
- **ADRs are immutable once shipped.** Supersede with a new number; mark the old
  `Superseded by NNNN`.
- Behaviour changed? The rule changes **in the same PR** (R1).

## 6. Commands

```bash
# ids, cited paths, critical-rules-have-tests
bun .github/scripts/check-domain.ts

# guarded code changed => rule cited or rules.md edited
bun .github/scripts/check-domain-coverage.ts
```

Guarded paths and the domain→prefix map: `.github/scripts/domain-guards.ts`.

## See also

- `.domain/README.md` — priority of truth, bounded contexts, ADR template, R1–R6.
- `.domain/_template/rules.md` — the rule format and field reference.
- `.domain/glossary.md` — vocabulary, and the false-friend pairs.
