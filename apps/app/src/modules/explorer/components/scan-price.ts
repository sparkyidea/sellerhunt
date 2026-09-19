interface PriceRange {
  currency: string | null;
  priceMax: number | null;
  priceMin: number | null;
}

export function formatScanPrice(price: number | null, currency: string | null) {
  if (price === null || !currency) {
    return "Unknown";
  }
  try {
    return (price / 100).toLocaleString("en-US", {
      style: "currency",
      currency,
    });
  } catch {
    return `${price / 100} ${currency}`;
  }
}

export function formatScanPriceRange({
  priceMin,
  priceMax,
  currency,
}: PriceRange) {
  if (priceMin === null || priceMax === null || !currency) {
    return "Unknown";
  }
  return priceMin === priceMax
    ? formatScanPrice(priceMin, currency)
    : `${formatScanPrice(priceMin, currency)} – ${formatScanPrice(priceMax, currency)}`;
}

export function variantLabel(v: {
  attributes: Record<string, string> | null;
  reference: string;
}) {
  return (
    Object.values(v.attributes ?? {}).join(" / ") ||
    (v.reference === "__default__" ? "Default" : v.reference)
  );
}
