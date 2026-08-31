# .agents Directory

Source of truth for AI agent context. Both `AGENTS.md` at the repo root (vendor-neutral) and `.claude/CLAUDE.md` (Claude Code) are thin loaders that point here. Other agent tools (Codex, Cursor, Aider, etc.) read the same content via `AGENTS.md`.

`.agents/` is the conventional hidden directory used by multi-tool installers and harnesses.

## Scope boundary

`.agents/` holds **how we write code here** — conventions, layering, lint,
workflow. It does **not** hold product or domain knowledge; that lives in
[`../.domain/`](../.domain/), and `.plan/` holds work in flight. One fact, one
home: if you're about to write a product fact here, write it there instead.

## Layout

- `rules/` — modular, single-responsibility rule files. Filenames are namespaced by section prefix (see `rules/_sections.md`). Each rule follows `rules/_template.md`.
- `knowledge-base.md` — code-facing orientation: app topology, auth wiring, data-access patterns, DB workflow. Product/domain facts go to `../.domain/`.
- `skills/` — vendor-neutral Skills (SKILL.md format). Auto-loaded on demand by any compatible agent tool based on the SKILL.md `description`.

## How to use

- Browsing as a human? Start with `../.domain/README.md`, then `knowledge-base.md`, then `rules/reference-file-locations.md`.
- Writing a new rule? Copy `rules/_template.md`, pick the right section prefix from `rules/_sections.md`.
- Adding a project skill? Create `skills/<name>/SKILL.md` with frontmatter `name` and `description`.
- Don't duplicate what code, `git log`, or generated types already say. Only commit truly non-obvious knowledge.
- Writing about the product, an entity, a marketplace's behaviour, or why a call was made? That's `../.domain/`.
