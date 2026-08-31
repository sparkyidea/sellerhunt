"use client";

import { ListSkeleton } from "@sparkyidea/dataview/skeletons";
import { linkedProductListProperties } from "./linked-product-list-properties";

export function LinkedProductListSkeleton() {
  return <ListSkeleton properties={linkedProductListProperties} rowCount={1} />;
}
