import { describe, expect, it } from "bun:test";
import { getCategory, getCategoryTree, getTaxonomyVersion } from "../src/index";

describe("getCategory", () => {
  it('returns Animals & Pet Supplies for "ap"', () => {
    const cat = getCategory("ap");
    expect(cat).not.toBeNull();
    expect(cat?.id).toBe("ap");
    expect(cat?.name).toBe("Animals & Pet Supplies");
    expect(cat?.level).toBe(0);
    expect(cat?.parentId).toBeNull();
  });

  it("returns null for invalid id", () => {
    expect(getCategory("invalid-id")).toBeNull();
  });

  it('returns a category with parentId "ap" for "ap-1"', () => {
    const cat = getCategory("ap-1");
    expect(cat).not.toBeNull();
    expect(cat?.parentId).toBe("ap");
  });
});

describe("getCategoryTree", () => {
  it("returns 26 top-level categories", () => {
    const tree = getCategoryTree();
    expect(tree.length).toBe(26);
  });

  it("tree nodes have children arrays", () => {
    const tree = getCategoryTree();
    for (const node of tree) {
      expect(Array.isArray(node.children)).toBe(true);
    }
    const apNode = tree.find((n) => n.id === "ap");
    expect(apNode).not.toBeNull();
    expect(apNode?.children.length).toBeGreaterThan(0);
  });
});

describe("getTaxonomyVersion", () => {
  it("returns version string and category count", () => {
    const info = getTaxonomyVersion();
    expect(info).not.toBeNull();
    expect(typeof info?.version).toBe("string");
    expect(info?.categoryCount).toBeGreaterThan(0);
  });
});
