# <Domain> rules

<!--
TEMPLATE — copy to .domain/<domain>/rules.md and delete this comment.

Rule IDs are permanent. Never renumber, never reuse a retired ID. A rule that
stops being true gets `status: retired` and a note — it does not get deleted,
because code and tests reference the ID.

Prefixes are fixed per domain (see .domain/README.md):
  TEN tenancy · CAT catalog · CHN channels · LST listings
  ORD orders  · INV inventory · FUL fulfillment · SYN sync

Validate with: bun .github/scripts/check-domain.ts
-->

Invariants for <domain>. Each has a permanent ID that code comments, tests, and
PRs reference.

---

### XXX-001 — <the rule, stated as an imperative or an always-true fact>

```yaml
id: XXX-001
severity: critical        # critical | high | medium
status: enforced          # enforced | advisory | proposed | retired
adr: 0000                 # optional — the decision that established it
code:                     # where it lives; every path must exist
  - packages/<pkg>/src/<file>.ts
tests:                    # what proves it. critical rules MUST have >= 1
  - packages/<pkg>/src/__tests__/<file>.test.ts
```

**Rule.** One sentence. Unambiguous. No hedging — if it needs "usually", it's
`advisory`, not `enforced`.

**Why.** The failure this prevents. Concrete, not abstract.

**Violating looks like.** What a reviewer or an agent would actually see in a
diff that breaks this. This section is what makes the rule catchable.

---

## Field reference

| Field      | Meaning                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `id`       | Permanent. Must match the heading and the folder's prefix.                                            |
| `severity` | `critical` = data corruption, money, or account risk. `high` = user-visible wrong. `medium` = friction. |
| `status`   | `enforced` = true today and tested. `advisory` = true but not mechanically checked. `proposed` = agreed, not built. `retired` = no longer true; keep the ID, say what replaced it. |
| `adr`      | Optional. Number only — the checker resolves it to `decisions/NNNN-*.md`.                             |
| `code`     | Where the rule is implemented. Paths are checked to exist.                                            |
| `tests`    | What would fail if the rule broke. `critical` + `enforced` requires at least one.                     |
