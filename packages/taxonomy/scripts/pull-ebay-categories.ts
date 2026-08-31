/**
 * Pull eBay US category tree via the Commerce Taxonomy REST API.
 *
 * Uses client credentials (app token) — no user OAuth needed.
 * Loads EBAY_CLIENT_ID and EBAY_CLIENT_SECRET from apps/api/.env.
 *
 * Fetches the full category tree and splits into one file per top-level
 * category under `data/integrations/ebay/{version}/categories/`.
 *
 * Usage:
 *   bun run packages/taxonomy/scripts/pull-ebay-categories.ts
 *
 * Environment (loaded from apps/api/.env):
 *   EBAY_CLIENT_ID      - eBay app client ID (App ID)
 *   EBAY_CLIENT_SECRET  - eBay app client secret (Cert ID)
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import dotenv from "dotenv";

// ---------------------------------------------------------------------------
// Load env from apps/api/.env (same pattern as marketplace sandbox)
// ---------------------------------------------------------------------------

const serverEnvPath = resolve(import.meta.dirname, "../../../apps/api/.env");
dotenv.config({ path: serverEnvPath });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EbayCategory {
  fullName: string;
  id: string;
  leaf: boolean;
  level: number;
  name: string;
  parentId: string | null;
}

interface CombinedOutput {
  categories: EbayCategory[];
  site: string;
  totalCategories: number;
  version: string;
}

interface VerticalOutput {
  categories: EbayCategory[];
  leaves: number;
  totalCategories: number;
  vertical: string;
}

// eBay Commerce Taxonomy API response shapes
interface TaxonomyCategoryNode {
  category: {
    categoryId: string;
    categoryName: string;
  };
  categoryTreeNodeLevel: number;
  childCategoryTreeNodes?: TaxonomyCategoryNode[];
  leafCategoryTreeNode?: boolean;
}

interface CategoryTreeResponse {
  categoryTreeId: string;
  categoryTreeVersion: string;
  rootCategoryNode: TaxonomyCategoryNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[,&]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");

const INTEGRATIONS_DIR = join(import.meta.dir, "../data/integrations/ebay");

const getDataDir = (version: string): string =>
  join(INTEGRATIONS_DIR, version, "categories");

// ---------------------------------------------------------------------------
// OAuth app token (client credentials grant — no user auth needed)
// ---------------------------------------------------------------------------

const getAppToken = async (
  clientId: string,
  clientSecret: string
): Promise<string> => {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
};

// ---------------------------------------------------------------------------
// Fetch category tree via Commerce Taxonomy API
// ---------------------------------------------------------------------------

const fetchCategoryTree = async (
  token: string
): Promise<CategoryTreeResponse> => {
  const response = await fetch(
    "https://api.ebay.com/commerce/taxonomy/v1/category_tree/0",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Category tree request failed (${response.status}): ${text}`
    );
  }

  return (await response.json()) as CategoryTreeResponse;
};

// ---------------------------------------------------------------------------
// Flatten the nested tree into our flat category format
// ---------------------------------------------------------------------------

const flattenTree = (
  node: TaxonomyCategoryNode,
  parentId: string | null,
  ancestors: string[]
): EbayCategory[] => {
  const categories: EbayCategory[] = [];

  const fullName =
    ancestors.length > 0
      ? `${ancestors.join(" > ")} > ${node.category.categoryName}`
      : node.category.categoryName;

  categories.push({
    id: node.category.categoryId,
    name: node.category.categoryName,
    fullName,
    parentId,
    level: node.categoryTreeNodeLevel,
    leaf: node.leafCategoryTreeNode === true,
  });

  if (node.childCategoryTreeNodes) {
    const nextAncestors = [...ancestors, node.category.categoryName];
    for (const child of node.childCategoryTreeNodes) {
      categories.push(
        ...flattenTree(child, node.category.categoryId, nextAncestors)
      );
    }
  }

  return categories;
};

// ---------------------------------------------------------------------------
// Split by top-level category and write files
// ---------------------------------------------------------------------------

const splitAndWrite = async (
  combined: CombinedOutput,
  dataDir: string
): Promise<void> => {
  const topLevelCategories = combined.categories.filter(
    (c) => c.parentId === null
  );

  const parentToChildren = new Map<string, EbayCategory[]>();
  for (const cat of combined.categories) {
    if (cat.parentId !== null) {
      const existing = parentToChildren.get(cat.parentId) ?? [];
      existing.push(cat);
      parentToChildren.set(cat.parentId, existing);
    }
  }

  const collectDescendants = (rootId: string): EbayCategory[] => {
    const result: EbayCategory[] = [];
    const queue = [rootId];

    while (queue.length > 0) {
      const currentId = queue.pop() as string;
      const children = parentToChildren.get(currentId) ?? [];
      for (const child of children) {
        result.push(child);
        queue.push(child.id);
      }
    }

    return result;
  };

  console.log(
    `\nSplitting ${combined.totalCategories} categories into per-vertical files...\n`
  );

  for (const topLevel of topLevelCategories) {
    const descendants = collectDescendants(topLevel.id);
    const allCategories = [topLevel, ...descendants];
    const leafCount = allCategories.filter((c) => c.leaf).length;

    const output: VerticalOutput = {
      vertical: topLevel.name,
      totalCategories: allCategories.length,
      leaves: leafCount,
      categories: allCategories,
    };

    const slug = toSlug(topLevel.name);
    const filePath = join(dataDir, `${slug}.json`);

    const json = `${JSON.stringify(output, null, 2)}\n`;
    // biome-ignore lint/correctness/noUndeclaredVariables: Bun global
    await Bun.write(filePath, json);

    const sizeKB = (new Blob([json]).size / 1024).toFixed(0);
    console.log(
      `  ${slug}.json — ${allCategories.length} categories (${leafCount} leaves, ${sizeKB} KB)`
    );
  }

  console.log(`\nTop-level verticals: ${topLevelCategories.length}`);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!(clientId && clientSecret)) {
    console.error(
      "Error: EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set.\n" +
        `Checked: ${serverEnvPath}\n` +
        "Or export them directly before running."
    );
    process.exit(1);
  }

  console.log("Fetching OAuth app token...");
  const token = await getAppToken(clientId, clientSecret);
  console.log("Token acquired.\n");

  console.log("Fetching category tree (EBAY_US, tree ID 0)...");
  const tree = await fetchCategoryTree(token);
  const version = tree.categoryTreeVersion;
  console.log(`Tree version: ${version}, tree ID: ${tree.categoryTreeId}\n`);

  const categories: EbayCategory[] = [];

  if (tree.rootCategoryNode.childCategoryTreeNodes) {
    for (const topNode of tree.rootCategoryNode.childCategoryTreeNodes) {
      categories.push(...flattenTree(topNode, null, []));
    }
  }

  console.log(`Total categories: ${categories.length}`);
  console.log(`Leaf categories: ${categories.filter((c) => c.leaf).length}\n`);

  const combined: CombinedOutput = {
    version,
    site: "EBAY_US",
    totalCategories: categories.length,
    categories,
  };

  const dataDir = getDataDir(version);
  await mkdir(dataDir, { recursive: true });
  await splitAndWrite(combined, dataDir);

  console.log(`\nDone. Output: ${dataDir}/`);
};

await main();
