import { db } from "@dashseller/db";
import { listing, order, product } from "@dashseller/db/schema";
import type { Column, SQL } from "drizzle-orm";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

export type SearchResultType = "product" | "listing" | "order";

export interface SearchResult {
  id: string;
  rank: number;
  subtitle: string | null;
  title: string;
  type: SearchResultType;
}

type SearchTable = typeof product | typeof listing | typeof order;

interface SearchEntityConfig {
  schema: SearchTable;
  /** Columns for fuzzy ILIKE fallback when tsvector misses */
  searchFields: Column[];
  /** "fuzzy" stems words so "running" matches "run" (default). "exact" matches tokens as-is — better for identifiers like order numbers. */
  searchMode?: "fuzzy" | "exact";
  subtitle: Column | SQL<string | null>;
  title: Column | SQL<string>;
}

/**
 * Search configuration per entity.
 * Only configure display (title/subtitle) and optional overrides.
 * tsvector, id, organizationId, archived are derived from the schema.
 */
const SEARCH_CONFIG: Record<SearchResultType, SearchEntityConfig> = {
  product: {
    schema: product,
    title: product.title,
    subtitle: product.brand,
    searchFields: [product.title],
  },
  listing: {
    schema: listing,
    title: listing.title,
    subtitle: listing.status,
    searchFields: [listing.title],
  },
  order: {
    schema: order,
    title: order.reference,
    subtitle: order.customerUsername,
    searchMode: "exact",
    searchFields: [
      order.orderNumber,
      order.reference,
      order.customerUsername,
      order.billingEmail,
    ],
  },
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildEntityQuery(
  type: SearchResultType,
  config: SearchEntityConfig,
  organizationId: string,
  trimmed: string,
  isUuid: boolean,
  ilikePattern: string
) {
  const pgDictionary = config.searchMode === "exact" ? "simple" : "english";
  const tsQuery = sql`websearch_to_tsquery(${sql.raw(`'${pgDictionary}'`)}, ${trimmed})`;
  const { schema } = config;

  return db
    .select({
      type: sql<SearchResultType>`${sql.raw(`'${type}'`)}`.as("type"),
      id: sql<string>`${schema.id}`.as("id"),
      title: sql<string>`${config.title}::text`.as("title"),
      subtitle: sql<string | null>`${config.subtitle}::text`.as("subtitle"),
      rank: sql<number>`CASE
        WHEN ${schema.search} @@ ${tsQuery}
        THEN ts_rank(${schema.search}, ${tsQuery})
        ELSE 0.01
      END`.as("rank"),
    })
    .from(schema)
    .where(
      and(
        eq(schema.organizationId, organizationId),
        eq(schema.archived, false),
        isUuid
          ? eq(schema.id, trimmed)
          : or(
              sql`${schema.search} @@ ${tsQuery}`,
              ...config.searchFields.map((col) => ilike(col, ilikePattern))
            )
      )
    );
}

/**
 * Cross-entity full-text search using PostgreSQL tsvector/tsquery.
 * Searches products, listings, and orders in a single query with relevance ranking.
 * Results are scoped to the given organization.
 */
export async function contextSearch(
  organizationId: string,
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const isUuid = UUID_REGEX.test(trimmed);
  const escaped = trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const ilikePattern = `%${escaped}%`;

  const productQuery = buildEntityQuery(
    "product",
    SEARCH_CONFIG.product,
    organizationId,
    trimmed,
    isUuid,
    ilikePattern
  );
  const listingQuery = buildEntityQuery(
    "listing",
    SEARCH_CONFIG.listing,
    organizationId,
    trimmed,
    isUuid,
    ilikePattern
  );
  const orderQuery = buildEntityQuery(
    "order",
    SEARCH_CONFIG.order,
    organizationId,
    trimmed,
    isUuid,
    ilikePattern
  );

  return await unionAll(productQuery, listingQuery, orderQuery)
    .orderBy(desc(sql`rank`))
    .limit(limit);
}
