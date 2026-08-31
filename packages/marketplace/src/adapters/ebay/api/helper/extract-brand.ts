/**
 * Extract brand from eBay ItemSpecifics NameValueList
 */
export function extractBrand(itemSpecifics?: {
  NameValueList?:
    | { Name?: string; Value?: string }
    | Array<{ Name?: string; Value?: string }>;
}): string | null {
  if (!itemSpecifics?.NameValueList) {
    return null;
  }

  const list = Array.isArray(itemSpecifics.NameValueList)
    ? itemSpecifics.NameValueList
    : [itemSpecifics.NameValueList];

  const brandItem = list.find((item) => item.Name === "Brand");
  return brandItem?.Value || null;
}
