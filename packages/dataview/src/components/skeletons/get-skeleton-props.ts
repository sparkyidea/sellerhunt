import type { PropertyType } from "../../types/property.type";

export interface SkeletonPropertyLike {
  hidden?: boolean;
  size?: number;
  type: PropertyType;
}

/**
 * Extract visible property types and sizes from a property array for skeleton rendering.
 * Filters out hidden properties and returns the types/sizes arrays that skeleton components expect.
 */
export function getSkeletonProps(properties: readonly SkeletonPropertyLike[]) {
  const visible = properties.filter((p) => !p.hidden);
  return {
    propertyTypes: visible.map((p) => p.type),
    propertySizes: visible.map((p) => p.size),
  };
}
