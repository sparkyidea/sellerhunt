---
title: Figma → Code Implementation
impact: HIGH
tags: [patterns, figma, ui, design-system]
---

## Figma → Code Implementation

**Impact: HIGH**

When a task starts from a Figma URL, frame, or screenshot, follow the flow below. The Figma MCP output is React + Tailwind, but it's a **reference of design and behavior**, not final code style — it will not match dashseller conventions out of the box.

### Required MCP flow (do not skip)

1. `get_design_context(fileKey, nodeId)` — primary call. Returns layout, tokens, structure, screenshot, and asset URLs.
2. If the response is truncated or `0:1`-page-level: call `get_metadata` first, find the target frame's node id, then `get_design_context` on that node.
3. `get_screenshot(fileKey, nodeId)` — visual reference. Keep it open while implementing.
4. Only then download assets and start coding. Validate the rendered UI against the screenshot before marking complete.

### Translate to dashseller conventions

The MCP output is throwaway. Translate every part of it:

- **Components** — never recreate primitives. Source from `@sparkyidea/ui/components/*` (`button`, `badge`, `separator`, `dialog`, `timeline`, etc.). Import the `cn` helper from `@sparkyidea/ui/lib/utils`. For app-level composition, place files under `apps/app/src/modules/<feature>/views/<entity>/` (split into sibling files when a panel grows multi-section — see `apps/app/src/modules/shipments/views/shipment/`).
- **Tokens, never hex** — semantic Tailwind classes only. Map Figma colors to the CSS variables defined in `packages/ui/src/styles/globals.css` (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-primary`, `text-destructive`, etc.). Status colors use the badge palette: `bg-badge-{gray,blue,purple,yellow,orange,red,pink,green,teal,inverted}[-subtle]` with matching `-foreground`. Spacing/radius come from the Tailwind 4 scale; the project's radius token is `var(--radius)` (≈ `rounded-lg`).
- **Icons** — generic icons via `lucide-react`. Brand/marketplace icons via `@sparkyidea/ui/icons` (`Icons.usps`, `Icons.fedex`, etc.). **Do not** install new icon packages, **do not** inline SVGs from the Figma payload as React components when a Lucide equivalent exists.
- **Path alias** — `@/` resolves to `apps/app/src/`. Cross-package imports use `@sparkyidea/*` (UI, dataview) or `@dashseller/*` (db, trpc, auth, marketplace, taxonomy, trigger, env).
- **Data** — `useQuery` at page level, `useSuspenseQuery` inside dataview tables. (See `.agents/knowledge-base.md` § "tRPC + React Query patterns" — don't flip these.)

**Incorrect:**

```tsx
// Pasted Figma output: hardcoded hex, raw <img> assets, ad-hoc divs.
<div className="bg-[#dcfce7] rounded-[32px] px-[9px] py-[5px]">
  <p className="text-[#008235] text-[12px] font-medium">Delivered</p>
</div>
<img src="https://www.figma.com/api/mcp/asset/abc-123" alt="" />
```

**Correct:**

```tsx
import { Badge } from "@sparkyidea/ui/components/badge";
import { CheckIcon } from "lucide-react";

<Badge variant="green-subtle">Delivered</Badge>
<CheckIcon className="size-4 text-foreground" />
```

### Asset handling

- Figma MCP `https://www.figma.com/api/mcp/asset/...` URLs **expire after 7 days** — never commit them as image `src`. If you actually need a raster from Figma, download it during implementation and save under the relevant app's static assets (or skip — most "image" payloads are icon SVGs that map to a Lucide/`Icons` equivalent).
- The `localhost` asset endpoint convention from the figma-implement-design skill **does not apply** in this repo — we use the remote MCP server. Treat any returned URL as ephemeral.

### Validate before completing

- Side-by-side check against the `get_screenshot` output (spacing, typography weight, color, alignment).
- Run `bun x ultracite fix <files>` then `bun check-types` on the affected app. The `noExcessiveCognitiveComplexity` lint frequently fires on Figma translations — extract sub-components (e.g. one component per Figma section) rather than disabling the rule.
- For panels rendered in long-lived shells (right-rail, sheets), reset scroll on identity change with `useEffect` + a container ref keyed on the id prop — the same DOM persists across selections.

### Skill boundary

- Implementing code from a Figma node → use the `figma-implement-design` skill (Figma MCP tools).
- Writing back into Figma (creating frames, components, variables) → switch to `figma-use` / `figma-generate-design`.
- Generating Code Connect mapping files (`*.figma.ts`) → switch to `figma-code-connect`.

Reference: `packages/ui/src/styles/globals.css` (token vocabulary), `packages/ui/src/components/` (primitive inventory), `apps/app/src/modules/shipments/components/shipment-tracking-panel/` (worked example of a multi-section Figma translation).
