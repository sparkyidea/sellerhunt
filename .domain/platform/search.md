# Full-Text Search

Cross-entity search (OmniSearch) using PostgreSQL full-text search with Drizzle generated columns.

## Architecture

```
Schema (tsvector column)  →  Search Service (UNION ALL query)  →  tRPC Router  →  OmniSearch UI
packages/db/src/schema/      packages/trpc/src/lib/              packages/trpc/    apps/app/src/
                             search-service.ts                  src/routers/     components/
                                                                search.ts        omni-search.tsx
```

**How it works:** Each searchable table has a `search` column of type `tsvector`, defined as a PostgreSQL `GENERATED ALWAYS AS ... STORED` column. PostgreSQL auto-computes the tsvector on every insert/update — no triggers, no application code needed. A GIN index on the column makes `@@` (match) queries fast.

## Adding Search to a New Entity

### Step 1: Add the generated column to the schema

```ts
// packages/db/src/schema/customer.ts
import { type SQL, sql } from "drizzle-orm";
import { index, pgTable, text } from "drizzle-orm/pg-core";
import { tsvector } from "../utils/custom-types";

export const customer = pgTable(
  "customer",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // ... other columns

    // Full-text search (generated column — auto-computed by PostgreSQL)
    search: tsvector("search").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('simple', coalesce(${customer.name}, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(${customer.email}, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(${customer.phone}, '')), 'B')
      `
    ),
  },
  (table) => [
    // GIN index for fast full-text search
    index("customer_search_idx").using("gin", table.search),
  ]
);
```

**Weight guide:**
| Weight | Priority | Use for |
|--------|----------|---------|
| `A`    | Highest  | Primary identifiers — title, name, order number |
| `B`    | Medium   | Secondary identifiers — brand, email, subtitle |
| `C`    | Low      | Body text — description, notes |
| `D`    | Lowest   | Rarely used — metadata, tags |

**Language choice:**
- `'english'` — Stems words (e.g. "running" matches "run"). Use for natural language fields like title, description.
- `'simple'` — No stemming, exact token match. Use for identifiers like order numbers, emails, SKUs.

### Step 2: Generate and run the migration

```bash
bunx drizzle-kit generate   # creates SQL migration
bunx drizzle-kit migrate    # applies it to the database
```

The generated SQL will contain `GENERATED ALWAYS AS (...) STORED` — no manual SQL needed.

### Step 3: Add a subquery in search-service.ts

Open `packages/trpc/src/lib/search-service.ts` and add a new subquery block:

```ts
import { customer } from "@dashseller/db/schema";

// 1. Add to the SearchResultType union
export type SearchResultType = "product" | "listing" | "order" | "customer";

// 2. Choose the matching tsquery language
const tsQuerySimple = sql`websearch_to_tsquery('simple', ${trimmed})`;

// 3. Add the subquery (follow the existing pattern)
const customerQuery = db
  .select({
    type: sql<SearchResultType>`'customer'`.as("type"),
    id: customer.id,
    title: customer.name,
    subtitle: customer.email,
    imageUrl: sql<string>`NULL`.as("image_url"),
    rank: sql<number>`CASE
      WHEN ${customer.search} @@ ${tsQuerySimple}
      THEN ts_rank(${customer.search}, ${tsQuerySimple})
      ELSE 0.01
    END`.as("rank"),
  })
  .from(customer)
  .where(
    and(
      eq(customer.userId, userId),
      isUuid
        ? eq(customer.id, trimmed)
        : or(
            sql`${customer.search} @@ ${tsQuerySimple}`,
            ilike(customer.name, ilikePattern),
            ilike(customer.email, ilikePattern)
          )
    )
  );

// 4. Add to the UNION ALL
const results = await db.execute<SearchResult>(sql`
  (${productQuery.getSQL()})
  UNION ALL
  (${listingQuery.getSQL()})
  UNION ALL
  (${orderQuery.getSQL()})
  UNION ALL
  (${customerQuery.getSQL()})
  ORDER BY rank DESC
  LIMIT ${limit}
`);
```

**Important:** The `select` shape must match all other subqueries exactly: `type`, `id`, `title`, `subtitle`, `imageUrl`, `rank`.

### Step 4: Update the OmniSearch UI

Open `apps/app/src/components/omni-search.tsx` and add three entries:

```ts
// 1. Add to SearchResultItem type
type: "product" | "listing" | "order" | "customer";

// 2. Add type label
const TYPE_LABELS: Record<string, string> = {
  // ...existing
  customer: "Customers",
};

// 3. Add route
const RESULT_ROUTES: Record<string, string> = {
  // ...existing
  customer: "/customers",
};

// 4. Add icon
import { UserIcon } from "lucide-react";

const RESULT_ICONS: Record<string, React.ReactNode> = {
  // ...existing
  customer: <UserIcon className="size-4" />,
};
```

No other UI changes needed — grouping, rendering, and navigation are all driven by these maps.

## Adding Fields to an Existing Entity

To make an existing column searchable, add it to the `search` generated column expression:

```ts
// Before
search: tsvector("search").generatedAlwaysAs(
  (): SQL => sql`
    setweight(to_tsvector('english', coalesce(${product.title}, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(${product.brand}, '')), 'B')
  `
),

// After — added SKU with weight A
search: tsvector("search").generatedAlwaysAs(
  (): SQL => sql`
    setweight(to_tsvector('english', coalesce(${product.title}, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(${product.sku}, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(${product.brand}, '')), 'B')
  `
),
```

Then regenerate the migration. PostgreSQL will recompute the column for all existing rows.

**Note:** Use `'simple'` for identifier fields (SKU, UPC, email) and `'english'` for natural language fields (title, description). Mixing languages in the same generated column is fine — each `to_tsvector()` call is independent.

## How the Query Works

```
User types "wired mouse"
        ↓
websearch_to_tsquery('english', 'wired mouse')  →  'wire' & 'mous'  (stemmed)
        ↓
product.search @@ tsquery  →  GIN index lookup (fast)
        ↓
ts_rank(product.search, tsquery)  →  relevance score (weights A>B>C>D)
        ↓
UNION ALL across all entities  →  ORDER BY rank DESC
```

- `websearch_to_tsquery` handles user input safely (supports quotes, `-exclude`, `OR`)
- `ts_rank` uses the `setweight` assignments to score relevance
- `ilike` fallback catches partial matches the tsvector misses (e.g. email fragments)
- UUID detection short-circuits to exact ID match

## File Reference

| File | Purpose |
|------|---------|
| `packages/db/src/utils/custom-types.ts` | Custom Drizzle `tsvector` column type |
| `packages/db/src/schema/product.ts` | Product search column (english: title/brand/description) |
| `packages/db/src/schema/listing.ts` | Listing search column (english: title/subtitle/brand/description) |
| `packages/db/src/schema/order.ts` | Order search column (simple: orderNumber/reference/customerUsername/email) |
| `packages/trpc/src/lib/search-service.ts` | Cross-entity UNION ALL search with ranking |
| `packages/trpc/src/routers/search.ts` | tRPC endpoint (`search.omni`) |
| `apps/app/src/components/omni-search.tsx` | Cmd+K command palette UI |
| `apps/app/src/hooks/use-omni-search.ts` | Zustand store for open/close state |
