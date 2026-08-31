import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CategoryRaw {
  children: { id: string; name: string }[];
  full_name: string;
  id: string;
  level: number;
  name: string;
  parent_id: string | null;
}

interface VerticalFile {
  categories: CategoryRaw[];
  version: string;
}

export interface CategoryInfo {
  fullName: string;
  id: string;
  leaf: boolean;
  level: number;
  name: string;
  parentId: string | null;
}

export interface CategoryNode extends CategoryInfo {
  children: CategoryNode[];
}

export interface TaxonomyVersion {
  categoryCount: number;
  version: string;
}

const __dirname = import.meta.dir ?? dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../data");
const CATEGORIES_DIR = join(DATA_DIR, "categories");

let categoryMap: Map<string, CategoryRaw> | null = null;
let taxonomyVersion: string | null = null;

const ensureCategoryMap = (): Map<string, CategoryRaw> | null => {
  if (categoryMap) {
    return categoryMap;
  }

  try {
    const files = readdirSync(CATEGORIES_DIR).filter((f) =>
      f.endsWith(".json")
    );
    if (files.length === 0) {
      return null;
    }

    categoryMap = new Map();
    for (const file of files) {
      const content = readFileSync(join(CATEGORIES_DIR, file), "utf-8");
      const data: VerticalFile = JSON.parse(content);
      if (!taxonomyVersion) {
        taxonomyVersion = data.version;
      }
      for (const cat of data.categories) {
        categoryMap.set(cat.id, cat);
      }
    }
    return categoryMap;
  } catch {
    return null;
  }
};

const toInfo = (raw: CategoryRaw): CategoryInfo => ({
  id: raw.id,
  name: raw.name,
  fullName: raw.full_name,
  parentId: raw.parent_id,
  level: raw.level,
  leaf: raw.children.length === 0,
});

export const getCategory = (id: string): CategoryInfo | null => {
  const map = ensureCategoryMap();
  if (!map) {
    return null;
  }
  const raw = map.get(id);
  if (!raw) {
    return null;
  }
  return toInfo(raw);
};

export const getCategoryTree = (): CategoryNode[] => {
  const map = ensureCategoryMap();
  if (!map) {
    return [];
  }

  const buildNode = (raw: CategoryRaw): CategoryNode => {
    const childNodes: CategoryNode[] = raw.children
      .map((child) => map.get(child.id))
      .filter((c): c is CategoryRaw => c !== undefined)
      .map(buildNode);

    return {
      ...toInfo(raw),
      children: childNodes,
    };
  };

  const topLevel = [...map.values()].filter((cat) => cat.parent_id === null);
  return topLevel.map(buildNode);
};

export const getTaxonomyVersion = (): TaxonomyVersion | null => {
  const map = ensureCategoryMap();
  if (!(map && taxonomyVersion)) {
    return null;
  }
  return {
    version: taxonomyVersion,
    categoryCount: map.size,
  };
};
